import { describe, expect, it } from 'bun:test'
import { del, parseSetCookie, post } from '../helpers/app'
import {
	avancarJanelaDeLogin,
	grantRbac,
	loginAs,
	SENHA_PADRAO,
	userRecord
} from '../helpers/auth'
import { prismaMock } from '../helpers/prisma-mock'

const ROTA = '/api/seguranca/auth/session'

/**
 * O registro roda no `afterResponse`, ou seja, depois da resposta já ter saído.
 * `app.handle()` resolve antes disso, então a asserção precisa deixar a fila de
 * microtasks drenar — é exatamente a propriedade que se quer: nada disso está no
 * caminho do login.
 */
const depoisDaResposta = () => Bun.sleep(10)

function payloadDoCookie(setCookie) {
	const token = parseSetCookie(setCookie).value
	return JSON.parse(atob(token.split('.')[1]))
}

async function comUsuario(overrides = {}) {
	const usuario = await userRecord(overrides)
	prismaMock.User.findFirst.mockResolvedValue(usuario)
	grantRbac({ permissions: [], roles: [] })
	avancarJanelaDeLogin()
	return usuario
}

describe('histórico de acesso — login', () => {
	it('grava a linha com o usuário e o jti do token', async () => {
		const usuario = await comUsuario()

		const { cookies } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})
		await depoisDaResposta()

		const [args] = prismaMock.user_access_history.create.mock.calls.at(-1)
		expect(args.data.user_id).toBe(usuario.id)
		expect(args.data.jti).toBe(payloadDoCookie(cookies[0]).jti)
		expect(args.data.login_at).toBeInstanceOf(Date)
		expect(args.data.logout_at).toBeUndefined()
	})

	it('cada login recebe um jti próprio', async () => {
		const usuario = await comUsuario()

		const primeiro = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})
		avancarJanelaDeLogin()
		const segundo = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})
		await depoisDaResposta()

		expect(payloadDoCookie(primeiro.cookies[0]).jti).not.toBe(
			payloadDoCookie(segundo.cookies[0]).jti
		)
	})

	it('não roda antes da resposta sair', async () => {
		const usuario = await comUsuario()

		await post(ROTA, { email: usuario.email, password: SENHA_PADRAO })
		const durante = prismaMock.user_access_history.create.mock.calls.length
		// Drena antes de terminar: sem isto o INSERT cairia no teste seguinte.
		await depoisDaResposta()

		expect(durante).toBe(0)
		expect(prismaMock.user_access_history.create.mock.calls).toHaveLength(1)
	})

	it('login recusado não grava nada', async () => {
		const usuario = await comUsuario()

		await post(ROTA, { email: usuario.email, password: 'senha-errada' })
		await depoisDaResposta()

		expect(prismaMock.user_access_history.create).not.toHaveBeenCalled()
	})

	it('falha no INSERT não derruba o login', async () => {
		const usuario = await comUsuario()
		prismaMock.user_access_history.create.mockRejectedValue(
			new Error('banco fora')
		)

		const { status } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})
		await depoisDaResposta()

		expect(status).toBe(200)
	})
})

describe('histórico de acesso — logout', () => {
	it('fecha a linha aberta com aquele jti e calcula a duração', async () => {
		const { cookie, setCookie } = await loginAs()
		const { jti } = payloadDoCookie(`${setCookie.name}=${setCookie.value}`)
		const loginAt = new Date(Date.now() - 90_000)
		prismaMock.user_access_history.findFirst.mockResolvedValue({
			id: 42n,
			login_at: loginAt
		})

		await del(ROTA, { cookie })
		await depoisDaResposta()

		const [busca] = prismaMock.user_access_history.findFirst.mock.calls.at(-1)
		expect(busca.where).toEqual({ jti, logout_at: null })

		const [update] = prismaMock.user_access_history.update.mock.calls.at(-1)
		expect(update.where).toEqual({ id: 42n })
		expect(update.data.logout_at).toBeInstanceOf(Date)
		expect(update.data.session_duration).toBe(90)
	})

	it('logout sem sessão não procura nada', async () => {
		await del(ROTA)
		await depoisDaResposta()

		expect(prismaMock.user_access_history.findFirst).not.toHaveBeenCalled()
	})

	it('nenhuma linha aberta para o jti não vira update', async () => {
		const { cookie } = await loginAs()
		prismaMock.user_access_history.findFirst.mockResolvedValue(null)

		await del(ROTA, { cookie })
		await depoisDaResposta()

		expect(prismaMock.user_access_history.update).not.toHaveBeenCalled()
	})
})
