import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { settings } from 'src/config'
import { sessaoService } from 'src/services/_sessao.service'

if (!settings.JWT_SECRET) {
	throw new Error('JWT_SECRET é obrigatório nas configurações')
}

/**
 * Atributos do cookie de sessão. `httpOnly` impede leitura por JavaScript —
 * o token nunca chega ao front-end, só trafega entre browser e servidor.
 */
const authCookieOptions = {
	httpOnly: true,
	secure: settings.COOKIE_SECURE,
	sameSite: settings.COOKIE_SAMESITE,
	path: '/',
	...(settings.COOKIE_DOMAIN && { domain: settings.COOKIE_DOMAIN })
}

/**
 * Grava o JWT no cookie de sessão.
 * @param {object} cookie - `cookie` do contexto da Elysia
 * @param {string} token - JWT assinado
 */
export function setAuthCookie(cookie, token) {
	cookie[settings.COOKIE_NAME].set({
		value: token,
		maxAge: settings.COOKIE_MAX_AGE,
		...authCookieOptions
	})
}

/**
 * Remove o cookie de sessão (logout).
 * @param {object} cookie - `cookie` do contexto da Elysia
 */
export function clearAuthCookie(cookie) {
	cookie[settings.COOKIE_NAME].set({
		value: '',
		maxAge: 0,
		...authCookieOptions
	})
}

/**
 * Decora o contexto com `jwt` (sign/verify) e resolve `user` a partir do cookie
 * de sessão. Rotas públicas recebem `user: null`; a exigência de autenticação
 * fica a cargo do middleware `authenticate`.
 *
 * É `derive`, não `resolve`: `resolve` roda no estágio de `beforeHandle`, que a
 * Elysia executa **depois** da validação de `query`/`body`. Com `user` só ali,
 * uma requisição anônima a uma rota com query obrigatória levava 400 antes de
 * levar 401 — o schema vazava para quem nem sessão tinha. `derive` roda no
 * estágio de `transform`, antes da validação, e é o que permite ao portão de
 * `/api` responder 401 primeiro.
 */
export const jwtPlugin = new Elysia({ name: 'jwt' })
	.use(
		jwt({
			name: 'jwt',
			secret: settings.JWT_SECRET,
			alg: settings.JWT_ALGORITHM,
			exp: settings.JWT_EXPIRES_IN
		})
	)
	.derive(async ({ jwt, cookie }) => {
		const token = cookie[settings.COOKIE_NAME]?.value

		if (!token) return { user: null }

		const payload = await jwt.verify(token)
		if (!payload) return { user: null }

		// Assinatura válida não basta: o token sobrevive à desativação, à troca
		// de senha e ao "encerrar sessões". A versão assinada (`tv`) tem de bater
		// com a do banco — ver `_sessao.service.js`.
		if (!(await sessaoService.valida(payload))) return { user: null }

		return { user: payload }
	})
	.as('global')

export default jwtPlugin
