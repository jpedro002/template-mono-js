import { status } from 'elysia'
import { authorizationService, prisma } from 'src/services'

/**
 * Contenção de escalada: ninguém concede, nem mexe em quem tem, acesso que ele
 * próprio não tem.
 *
 * Sem isto, `users:update` sozinho bastava para virar root — atribuir a si a
 * role com `*` por `POST /usuarios/:id/roles/:roleId`, ou redefinir a senha de
 * um Superadmin e entrar como ele. `roles:update` adicionava `*` à própria role
 *. Hoje só quem tem
 * acesso total tem essas permissões, mas bastava delegar uma para abrir tudo.
 *
 */

const negado = message =>
	status(403, { error: 'Forbidden', message, statusCode: 403 })

function cobre(permissoesDoAtor, identifier) {
	if (permissoesDoAtor.includes('*')) return true
	if (identifier.startsWith('*')) return false
	return authorizationService.checkPermissionMatch(identifier, permissoesDoAtor)
}

/**
 * Tudo o que o alvo carrega — inclusive vencido, de role inativa ou de conta
 * desativada. Com o filtro do RBAC, um Superadmin desativado teria zero
 * permissões e qualquer um poderia trocar a senha dele e reativá-lo.
 */
async function carregadoPor(userId) {
	const [diretas, roles] = await Promise.all([
		prisma.userPermission.findMany({
			where: { userId },
			select: { permission: { select: { identifier: true } } }
		}),
		prisma.userRole.findMany({
			where: { userId },
			select: {
				role: {
					select: {
						rolePermissions: {
							select: { permission: { select: { identifier: true } } }
						}
					}
				}
			}
		})
	])

	return {
		identifiers: [
			...diretas.map(d => d.permission.identifier),
			...roles.flatMap(r =>
				r.role.rolePermissions.map(rp => rp.permission.identifier)
			)
		]
	}
}

async function conferir(ator, identifiers, message) {
	const permissoes = await authorizationService.getUserPermissions(ator.id)

	if (!identifiers.every(id => cobre(permissoes, id))) return negado(message)

	return null
}

/** O ator pode conceder estas permissões? */
function conferirPermissoes(ator, identifiers) {
	return conferir(
		ator,
		identifiers,
		'Você não pode conceder uma permissão que não tem'
	)
}

// Quem tem `*` cobre qualquer coisa: nem precisa ler o alvo.
async function temTudo(ator) {
	return (await authorizationService.getUserPermissions(ator.id)).includes('*')
}

/** O ator pode conceder (ou tirar) esta role? `null` quando pode. */
async function conferirRole(ator, roleId) {
	if (await temTudo(ator)) return null

	const role = await prisma.role.findUnique({
		where: { id: roleId },
		select: {
			rolePermissions: {
				select: { permission: { select: { identifier: true } } }
			}
		}
	})
	if (!role) return null

	return conferir(
		ator,
		role.rolePermissions.map(rp => rp.permission.identifier),
		'Você não pode atribuir um perfil com acesso que você não tem'
	)
}

/**
 * O ator pode editar, desativar, trocar a senha ou mexer nos acessos deste
 * usuário? Só se tudo o que o alvo tem estiver coberto pelo que o ator tem.
 */
async function conferirAlvo(ator, alvoId) {
	if (ator.id === alvoId || (await temTudo(ator))) return null

	const alvo = await carregadoPor(alvoId)
	return conferir(
		ator,
		alvo.identifiers,
		'Você não pode alterar um usuário com acesso que você não tem'
	)
}

/** Envolve um handler `({ params: { id } })` com `conferirAlvo`. */
const protegendoAlvo =
	handler =>
	async (ctx, ...resto) =>
		(await conferirAlvo(ctx.user, ctx.params.id)) ?? handler(ctx, ...resto)

export const contencao = {
	conferirAlvo,
	conferirPermissoes,
	conferirRole,
	protegendoAlvo
}
