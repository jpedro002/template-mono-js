import { status } from 'elysia'
import { baseController } from 'src/controllers'
import {
	ativacaoDe,
	leituraComInativos,
	porDeletedAtEActive
} from 'src/controllers/_ativacao.js'
import { conferirSenha, gerarHashSenha } from 'src/helpers/_senha.helper'
import {
	acessoTotalService,
	auditoriaService,
	authorizationService,
	novaVersaoDeToken,
	prisma,
	sessaoService
} from 'src/services'
import { contencao } from './_contencao.js'
import { emitirSessao } from './_session.controller.js'

/**
 * Desativar ou excluir a si mesmo é o caminho mais curto para ninguém
 * conseguir desfazer — e não tem caso de uso legítimo: outra pessoa com
 * `users:delete` faz isso.
 */
function naoSobreSiMesmo(user, alvoId, verbo) {
	if (user?.id !== alvoId) return null
	return status(409, {
		error: 'Conflict',
		message: `Você não pode ${verbo} o próprio usuário.`,
		statusCode: 409
	})
}

function usuarioController() {
	const select = null

	const recorteDeLeitura = leituraComInativos(
		'incluir_inativos',
		porDeletedAtEActive
	)

	// Filtro opcional por papel: `?role=NOME` sobre a listagem de usuários.
	const recorte = ctx => {
		const papel = ctx?.query?.role

		return {
			...recorteDeLeitura(ctx),
			...(papel && {
				userRoles: { some: { role: { name: papel, active: true } } }
			})
		}
	}

	const base = baseController('User', {
		select,
		// Predicado, e não `where: { deletedAt: null }` fixo: o filtro fixo é
		// incondicional, então o usuário inativado sumia de all/fetch/one/put e
		// não havia tela nenhuma que o mostrasse de volta. Ver `_ativacao.js`.
		where: recorte,
		omit: {
			password_hash: true
		},
		include: {
			userRoles: {
				include: {
					role: {
						include: {
							rolePermissions: {
								include: {
									permission: true
								}
							}
						}
					}
				}
			}
		},
		allowedFields: [
			'id',
			'email',
			'login',
			'name',
			'active',
			'createdAt',
			'updatedAt'
		],
		sensitiveFields: ['password_hash', 'senha', 'password', 'token', 'hash']
	})

	const post = async ({ body }) => {
		// A API recebe "password" em texto puro; o hash é feito no servidor.
		const { password: pwd, email, ...rest } = body

		const hashedPassword = await gerarHashSenha(pwd)

		const data = await prisma.User.create({
			data: {
				...rest,
				email: email.toLowerCase().trim(),
				password_hash: hashedPassword
			},
			omit: {
				password_hash: true
			}
		})

		return status(201, data)
	}

	const put = async ctx => {
		const { params, body, user } = ctx
		const { id } = params
		const { email, ...rest } = body
		const desativando = rest.active === false

		if (desativando) {
			const negado = naoSobreSiMesmo(user, id, 'desativar')
			if (negado) return negado
			await acessoTotalService.semUsuario(id)
		}

		const usuarioData = {
			...rest,
			...(email !== undefined && { email: email.toLowerCase().trim() }),
			// Desativar derruba as sessões abertas, não só o próximo login.
			...(desativando && novaVersaoDeToken())
		}

		// Mesmo predicado da leitura: este `put` não passa pelo `withBaseWhere`,
		// e o filtro fixo devolvia 404 ao salvar o usuário inativado que o
		// `incluir_inativos` acabou de abrir no formulário.
		const data = await prisma.$transaction(async tx => {
			const atualizado = await tx.User.update({
				where: { id, ...recorteDeLeitura(ctx) },
				data: usuarioData,
				omit: {
					password_hash: true
				}
			})
			if (desativando) {
				await auditoriaService.registrar(tx, {
					actorId: user.id,
					action: 'user.deactivate',
					targetUserId: id
				})
			}
			return atualizado
		})

		// `active: false` aqui tem de valer já, não no fim do TTL do cache.
		await authorizationService.clearCache(id)
		await sessaoService.invalidar(id)

		return status(200, data)
	}

	// Desativar é revogar: o cache de permissões segura o acesso por 5 min e o
	// de sessão por 30 s.
	const comCacheLimpo =
		handler =>
		async (ctx, ...resto) => {
			const resposta = await handler(ctx, ...resto)
			await authorizationService.clearCache(ctx.params.id)
			await sessaoService.invalidar(ctx.params.id)
			return resposta
		}

	const { ativar } = ativacaoDe('User', {
		omit: { password_hash: true },
		estado: porDeletedAtEActive,
		idDe: id => id,
		mensagens: {
			naoEncontrado: 'Usuário não localizado.',
			jaAtivo: 'O usuário já está ativo.'
		}
	})

	// Soft delete: grava `deletedAt` e `active: false` (o mesmo de sempre),
	// derruba as sessões abertas e audita — tudo na mesma transação.
	const del = async ctx => {
		const { params, user, set } = ctx
		const { id } = params

		const negado = naoSobreSiMesmo(user, id, 'excluir')
		if (negado) return negado

		await acessoTotalService.semUsuario(id)

		await prisma.$transaction(async tx => {
			await tx.User.update({
				where: { id, ...porDeletedAtEActive.filtroAtivo },
				data: {
					...porDeletedAtEActive.dadosInativar(),
					...novaVersaoDeToken()
				}
			})
			await auditoriaService.registrar(tx, {
				actorId: user.id,
				action: 'user.delete',
				targetUserId: id
			})
		})

		set.status = 204
		return null
	}

	/**
	 * Encerra todas as sessões abertas do usuário (browser, celular, token
	 * vazado). O próximo request de cada uma volta 401.
	 */
	const revogarSessoes = async ({ params, user, set }) => {
		const { id } = params

		const alvo = await prisma.User.findUnique({
			where: { id, deletedAt: null },
			select: { id: true }
		})
		if (!alvo) return status(404, { error: 'Usuário não encontrado' })

		await prisma.$transaction(async tx => {
			await sessaoService.revogar(tx, id)
			await auditoriaService.registrar(tx, {
				actorId: user.id,
				action: 'user.sessions.revoke',
				targetUserId: id
			})
		})
		await sessaoService.invalidar(id)

		set.status = 204
		return null
	}

	const resetPassword = async ({ params, body }) => {
		const { id } = params
		const { newPassword } = body

		const usuario = await prisma.User.findUnique({
			where: { id, deletedAt: null }
		})
		if (!usuario) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		const hashedPassword = await gerarHashSenha(newPassword)
		// Senha redefinida por um admin derruba as sessões do usuário: se a troca
		// foi por suspeita de acesso indevido, a sessão do invasor cai junto.
		await prisma.User.update({
			where: { id },
			data: { password_hash: hashedPassword, ...novaVersaoDeToken() }
		})
		await sessaoService.invalidar(id)
		return { success: true }
	}

	const updatePassword = async ({ user, body, jwt, cookie }) => {
		const { id } = user
		const { oldPassword, newPassword } = body
		if (!oldPassword || !newPassword) {
			return status(400, {
				error: 'oldPassword e newPassword são obrigatórios'
			})
		}
		const usuario = await prisma.User.findUnique({
			where: { id, deletedAt: null },
			select: { password_hash: true }
		})
		if (!usuario) {
			return status(404, { error: 'Usuário não encontrado' })
		}
		const match = await conferirSenha(oldPassword, usuario.password_hash)
		if (!match) {
			return status(401, { error: 'Senha antiga incorreta' })
		}

		const hashedPassword = await gerarHashSenha(newPassword)
		// Trocar a própria senha encerra as **outras** sessões (o motivo comum da
		// troca é desconfiar de alguém); esta continua porque recebe um cookie
		// novo, já com a versão nova.
		const atualizado = await prisma.User.update({
			where: { id },
			data: { password_hash: hashedPassword, ...novaVersaoDeToken() },
			select: {
				id: true,
				email: true,
				login: true,
				name: true,
				tokenVersion: true
			}
		})
		await sessaoService.invalidar(id)
		await emitirSessao({ usuario: atualizado, jwt, cookie, jti: user.jti })
		return { success: true }
	}

	/**
	 * Dados pessoais do próprio usuário.
	 *
	 * O pedido pendente de troca de e-mail sai sem o
	 * `token_hash`: era a credencial de confirmação viajando na resposta de uma
	 * tela de leitura.
	 */
	const perfil = async ({ user }) => {
		const usuario = await prisma.User.findUnique({
			where: { id: user.id, deletedAt: null },
			select: {
				id: true,
				name: true,
				email: true,
				login: true,
				phone: true,
				emailVerifiedAt: true
			}
		})

		if (!usuario) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		const pendente = await prisma.email_change_tokens.findFirst({
			where: { user_id: user.id, expires_at: { gt: new Date() } },
			select: { new_email: true, expires_at: true },
			orderBy: { id: 'desc' }
		})

		return {
			...usuario,
			troca_email_pendente: pendente
		}
	}
	/**
	 * Edição do próprio cadastro.
	 *
	 * Não aceita senha: trocá-la só com a sessão, sem provar a senha atual,
	 * deixaria uma sessão sequestrada trocar a senha. Quem troca senha usa
	 * `POST /usuarios/update-password`, que confere a antiga. E-mail também não
	 * entra — muda por `/auth/email/change/request`, com confirmação no novo
	 * endereço.
	 */
	const atualizarPerfil = async ({ user, body }) => {
		const usuario = await prisma.User.update({
			where: { id: user.id, deletedAt: null },
			data: body,
			select: {
				id: true,
				name: true,
				email: true,
				login: true,
				phone: true,
				emailVerifiedAt: true
			}
		})

		return usuario
	}

	/**
	 * Confere a senha atual sem trocar nada — o formulário de segurança pede a
	 * senha antes de liberar os campos. Devolve `{ valida: boolean }`, não 401:
	 * "senha errada" aqui é resposta de negócio, não falha de autenticação.
	 */
	const checkPassword = async ({ user, body }) => {
		const usuario = await prisma.User.findUnique({
			where: { id: user.id, deletedAt: null },
			select: { password_hash: true }
		})

		if (!usuario) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		return {
			valida: await conferirSenha(body.password, usuario.password_hash)
		}
	}

	const assignRole = async ({ params, body, user }) => {
		const { id: userId, roleId } = params
		const { expiresAt } = body || {}

		const target = await prisma.User.findUnique({
			where: { id: userId, deletedAt: null }
		})
		if (!target) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		const role = await prisma.Role.findUnique({ where: { id: roleId } })
		if (!role) {
			return status(404, { error: 'Role não encontrada' })
		}

		const negado = await contencao.conferirRole(user, roleId)
		if (negado) return negado

		// Quem atribuiu vem do token, nunca do body (evita spoofing). O service
		// faz o upsert e invalida o cache de permissões do usuário.
		const userRole = await authorizationService.assignRoleToUser(
			userId,
			roleId,
			user.id,
			expiresAt ? new Date(expiresAt) : null
		)

		return userRole
	}

	const removeRole = async ({ params, user }) => {
		const { id: userId, roleId } = params

		const negado = await contencao.conferirRole(user, roleId)
		if (negado) return negado

		await authorizationService.removeRoleFromUser(userId, roleId, user.id)
		return { success: true }
	}

	const grantPermission = async ({ params, body, user }) => {
		const { id: userId, permissionId } = params
		const { expiresAt } = body || {}

		const target = await prisma.User.findUnique({
			where: { id: userId, deletedAt: null }
		})
		if (!target) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		const permission = await prisma.Permission.findUnique({
			where: { id: permissionId }
		})
		if (!permission) {
			return status(404, { error: 'Permissão não encontrada' })
		}

		const negado = await contencao.conferirPermissoes(user, [
			permission.identifier
		])
		if (negado) return negado

		// grantedBy vem do token, nunca do body. Service invalida o cache.
		const userPermission = await authorizationService.grantPermissionToUser(
			userId,
			permissionId,
			user.id,
			expiresAt ? new Date(expiresAt) : null
		)

		return userPermission
	}

	const revokePermission = async ({ params, user }) => {
		const { id: userId, permissionId } = params

		await authorizationService.revokePermissionFromUser(
			userId,
			permissionId,
			user.id
		)
		return { success: true }
	}

	// Toda escrita sobre **outro** usuário passa pela contenção: quem não tem o
	// acesso do alvo não edita, desativa, troca a senha nem mexe nos acessos
	// dele. Ver `_contencao.js`.
	const { protegendoAlvo } = contencao

	return {
		...base,
		post,
		put: protegendoAlvo(put),
		del: protegendoAlvo(comCacheLimpo(del)),
		ativar: protegendoAlvo(comCacheLimpo(ativar)),
		updatePassword,
		resetPassword: protegendoAlvo(resetPassword),
		revogarSessoes: protegendoAlvo(revogarSessoes),
		perfil,
		atualizarPerfil,
		checkPassword,
		assignRole: protegendoAlvo(assignRole),
		removeRole: protegendoAlvo(removeRole),
		grantPermission: protegendoAlvo(grantPermission),
		revokePermission: protegendoAlvo(revokePermission)
	}
}

export { usuarioController }
