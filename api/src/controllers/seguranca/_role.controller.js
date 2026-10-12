import { status } from 'elysia'
import { baseController } from 'src/controllers'
import {
	ativacaoDe,
	leituraComInativos,
	porActive
} from 'src/controllers/_ativacao.js'
import {
	acessoTotalService,
	auditoriaService,
	authorizationService,
	prisma
} from 'src/services'
import { contencao } from './_contencao.js'

async function identificadoresDe(permissionIds = []) {
	if (permissionIds.length === 0) return []
	const permissoes = await prisma.permission.findMany({
		where: { id: { in: permissionIds } },
		select: { identifier: true }
	})
	return permissoes.map(p => p.identifier)
}

const select = {
	id: true,
	name: true,
	active: true,
	rolePermissions: {
		select: {
			permission: {
				select: { id: true, identifier: true, name: true }
			}
		}
	}
}

const base = baseController('Role', {
	select,
	where: leituraComInativos('incluir_inativas', porActive)
})

/**
 * `DELETE` inativa, `PATCH /:id/ativar` religa — não apaga.
 *
 * Antes o `del` do `baseController` apagava a linha de verdade, e `user_roles`
 * e `role_permissions` têm `ON DELETE CASCADE`: uma role excluída sumia de
 * todos os usuários que a tinham, em silêncio e sem desfazer. `Role` não tem
 * coluna de soft delete, mas tem `active` — e é `active` que o
 * `authorizationService` já lê ao montar as permissões da sessão, então
 * desligar aqui revoga de verdade.
 */
const { del, ativar } = ativacaoDe('Role', {
	select,
	estado: porActive,
	idDe: id => id,
	mensagens: {
		naoEncontrado: 'Role não localizada.',
		jaAtivo: 'A role já está ativa.'
	}
})

/**
 * POST - Criar nova role com permissões
 */
const post = async ({ body, user }) => {
	const { name, permissionIds } = body

	if (!name) {
		return status(400, {
			error: 'Nome da role é obrigatório'
		})
	}

	// Montar uma role com o que não se tem e atribuí-la depois é a mesma
	// escalada por outro caminho — ver `_contencao.js`.
	const negado = await contencao.conferirPermissoes(
		user,
		await identificadoresDe(permissionIds)
	)
	if (negado) return negado

	const role = await authorizationService.createRole(
		name,
		null,
		permissionIds || [],
		user.id
	)

	return status(201, role)
}

/**
 * PUT - Atualizar role e suas permissões
 */
const put = async ({ params, body, user }) => {
	const { id } = params
	const { name, active, permissionIds } = body

	// A role como está (quem a edita precisa cobrir o que ela já dá) e como vai
	// ficar (não pode ganhar o que o editor não tem).
	const negado =
		(await contencao.conferirRole(user, id)) ??
		(await contencao.conferirPermissoes(
			user,
			await identificadoresDe(permissionIds)
		))
	if (negado) return negado

	const antes = await prisma.role.findUnique({ where: { id }, select })
	if (!antes) return status(404, { error: 'Role não encontrada' })

	const trocaPermissoes = Array.isArray(permissionIds)
	const novosIdentificadores = trocaPermissoes
		? await identificadoresDe(permissionIds)
		: null
	const perdeTudo =
		antes.rolePermissions.some(rp => rp.permission.identifier === '*') &&
		(active === false ||
			(trocaPermissoes && !novosIdentificadores.includes('*')))
	if (perdeTudo) await acessoTotalService.semRole(id)

	await prisma.$transaction(async tx => {
		await tx.role.update({
			where: { id },
			data: {
				name: name !== undefined ? name : undefined,
				active: active !== undefined ? active : undefined
			}
		})
		if (name !== undefined || active !== undefined) {
			await auditoriaService.registrar(tx, {
				actorId: user.id,
				action: 'role.update',
				roleId: id,
				before: { name: antes.name, active: antes.active },
				after: { name: name ?? antes.name, active: active ?? antes.active }
			})
		}

		if (trocaPermissoes) {
			await tx.rolePermission.deleteMany({ where: { roleId: id } })
			if (permissionIds.length > 0) {
				await tx.rolePermission.createMany({
					data: permissionIds.map(permissionId => ({
						roleId: id,
						permissionId
					}))
				})
			}
			await auditoriaService.registrar(tx, {
				actorId: user.id,
				action: 'role.permissions.set',
				roleId: id,
				before: {
					permissions: antes.rolePermissions.map(rp => rp.permission.identifier)
				},
				after: { permissions: novosIdentificadores }
			})
		}
	})

	// Nome, `active` ou permissões: qualquer um muda a sessão de quem tem a
	// role. Invalida por usuário — o resto do cache continua válido.
	const userRoles = await prisma.userRole.findMany({
		where: { roleId: id },
		select: { userId: true }
	})
	await Promise.all(
		userRoles.map(({ userId }) => authorizationService.clearCache(userId))
	)

	// Retornar role atualizada
	return prisma.role.findUnique({
		where: { id },
		select
	})
}

/**
 * GET - Listar roles ativas
 */
const list = async () =>
	prisma.role.findMany({
		where: { active: true },
		select
	})

/**
 * GET - Listar usuários de uma role
 */
const getUsersByRole = async ({ params }) => {
	const { id } = params

	const userRoles = await prisma.userRole.findMany({
		where: { roleId: id },
		select: {
			user: {
				select: { id: true, email: true, login: true, name: true, active: true }
			}
		}
	})

	return userRoles.map(({ user }) => user)
}

// Desligar a role revoga — e o cache de permissões seguraria isso por 5 min.
// Também audita (`role.delete` ao desligar, `role.update` ao religar) e, ao
// desligar, confere que não some o último acesso total.
const protegendoRole =
	(handler, acao) =>
	async (ctx, ...resto) => {
		const negado = await contencao.conferirRole(ctx.user, ctx.params.id)
		if (negado) return negado

		if (acao === 'role.delete') await acessoTotalService.semRole(ctx.params.id)

		const resposta = await handler(ctx, ...resto)
		await auditoriaService.registrar(prisma, {
			actorId: ctx.user.id,
			action: acao,
			roleId: ctx.params.id,
			after: { active: acao !== 'role.delete' }
		})
		await authorizationService.clearCache()
		return resposta
	}

export const roleController = () => ({
	...base,
	post,
	put,
	del: protegendoRole(del, 'role.delete'),
	ativar: protegendoRole(ativar, 'role.update'),
	list,
	getUsersByRole
})
