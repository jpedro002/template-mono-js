import { status } from 'elysia'
import { metrics } from 'src/helpers/_metrics.helper'
import { conferirSenha } from 'src/helpers/_senha.helper'
import { clearAuthCookie, setAuthCookie } from 'src/plugins'
import {
	authorizationService,
	novaVersaoDeToken,
	prisma,
	sessaoService
} from 'src/services'

/**
 * Abre uma sessão para um usuário já autenticado: assina o JWT, grava o cookie
 * httpOnly e marca o evento de acesso. Qualquer fluxo que prove a identidade (login, cadastro,
 * convite) termina aqui.
 *
 * @param {object} params
 * @param {{id: string, email: string, login: string, name: string, tokenVersion?: number}} params.usuario
 * @param {object} params.jwt - plugin de JWT do contexto
 * @param {object} params.cookie - cookie do contexto
 * @param {object} [params.accessEvent] - caixa que o `afterResponse` consome
 * @param {string} [params.jti] - reaproveita o id da sessão atual (renovação
 *   do cookie depois de trocar a senha) em vez de abrir outra no histórico
 */
export async function emitirSessao({
	usuario,
	jwt,
	cookie,
	accessEvent,
	jti: jtiAtual
}) {
	const [permissions, roles] = await Promise.all([
		authorizationService.getUserPermissions(usuario.id),
		authorizationService.getUserRoles(usuario.id)
	])

	// Identifica *esta* sessão. Não é estado no servidor: serve para o logout
	// fechar no histórico de acesso exatamente a linha aberta neste login, sem
	// confundir duas sessões do mesmo usuário (browser e celular).
	const jti = jtiAtual ?? crypto.randomUUID()

	// Token enxuto: apenas identidade. Permissões/roles são buscadas no
	// servidor a cada requisição, então NÃO são embutidas no JWT — isso
	// evita permissões desatualizadas presas no token até a expiração.
	const token = await jwt.sign({
		id: usuario.id,
		email: usuario.email,
		login: usuario.login,
		name: usuario.name,
		jti,
		// Versão das sessões do usuário. Incrementar `users.token_version` derruba
		// este token na próxima requisição — ver `_sessao.service.js`.
		tv: usuario.tokenVersion ?? 0
	})

	// O token vai apenas no cookie httpOnly — nunca no corpo da resposta,
	// para que JavaScript no browser não consiga lê-lo (mitiga XSS).
	setAuthCookie(cookie, token)

	// O INSERT do histórico não entra no caminho crítico: o handler só marca o
	// que aconteceu e quem grava é o `afterResponse` da rota.
	if (accessEvent) {
		accessEvent.userId = usuario.id
		accessEvent.jti = jti
	}

	return {
		id: usuario.id,
		email: usuario.email,
		login: usuario.login,
		name: usuario.name,
		roles,
		permissions
	}
}

export const sessionController = () => {
	/**
	 * @param {import('elysia').Context} ctx
	 */
	const _login = async ({ body, jwt, cookie, accessEvent }) => {
		const { email, password } = body

		const usuario = await prisma.user.findFirst({
			where: {
				OR: [{ email: email.toLowerCase() }, { login: email.toLowerCase() }],
				active: true,
				deletedAt: null
			},
			select: {
				email: true,
				active: true,
				id: true,
				password_hash: true,
				name: true,
				login: true,
				tokenVersion: true,
				requiresRelogin: true
			}
		})

		// Sempre comparar com um hash (real ou dummy) para tempo constante — o
		// helper cai no hash descartável quando o usuário não existe.
		const isPasswordValid = await conferirSenha(
			password,
			usuario?.password_hash
		)

		// Mensagem genérica: não revela se o usuário existe ou está inativo.
		if (!usuario || !usuario.active || !isPasswordValid) {
			// O resultado é uma constante, não o motivo: distinguir "não existe" de
			// "senha errada" na métrica reintroduziria por painel a enumeração de
			// usuários que o hash dummy acima existe para evitar.
			metrics.auth.login('invalid_credentials')
			return status(401, {
				error: 'Unauthorized',
				message: 'Usuário ou senha inválidos'
			})
		}

		// "Exigir novo login" se cumpre aqui: a flag cai e a versão sobe, então
		// os tokens emitidos antes da marcação continuam mortos.
		if (usuario.requiresRelogin) {
			const atualizado = await prisma.user.update({
				where: { id: usuario.id },
				data: { requiresRelogin: false, ...novaVersaoDeToken() },
				select: { tokenVersion: true }
			})
			usuario.tokenVersion = atualizado.tokenVersion
			await sessaoService.invalidar(usuario.id)
		}

		const user = await emitirSessao({ usuario, jwt, cookie, accessEvent })

		metrics.auth.login('success')

		return { user }
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	const logout = async ({ cookie }) => {
		clearAuthCookie(cookie)
		return { success: true }
	}

	/**
	 * @param {import('elysia').Context & { user?: {id: string} }} ctx
	 */
	const getSession = async ({ user }) => {
		const userId = user?.id

		if (!userId) {
			return status(401, {
				error: 'Unauthorized',
				message: 'Token inválido'
			})
		}

		const usuario = await prisma.User.findUnique({
			where: {
				id: userId,
				active: true,
				deletedAt: null
			},
			omit: {
				password_hash: true
			}
		})

		if (!usuario) {
			return status(401, {
				error: 'Unauthorized',
				message: 'Usuário não encontrado ou inativo'
			})
		}

		const [roles, permissions] = await Promise.all([
			authorizationService.getUserRoles(userId),
			authorizationService.getUserPermissions(userId, true)
		])

		return {
			usuario: {
				id: usuario.id,
				email: usuario.email,
				login: usuario.login,
				name: usuario.name,
				roles,
				permissions,
				createdAt: usuario.createdAt,
				updatedAt: usuario.updatedAt,
				active: usuario.active
			}
		}
	}

	return {
		login: _login,
		logout,
		getSession
	}
}
