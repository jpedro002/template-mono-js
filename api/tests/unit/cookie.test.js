import { describe, expect, it } from 'bun:test'
import { settings } from 'src/config'
import { clearAuthCookie, setAuthCookie } from 'src/plugins'
import { runWithEnv } from '../helpers/subprocess'

/** Imita o proxy de cookie da Elysia, guardando o que foi gravado. */
function cookieProxy() {
	const gravado = {}
	const proxy = new Proxy(
		{},
		{
			get: (_alvo, nome) => ({
				set: valor => {
					gravado[nome] = valor
				}
			})
		}
	)
	return { proxy, gravado }
}

const CAPTURA = `
let capturado = null
const proxy = new Proxy({}, { get: (_a, nome) => ({ set: v => { capturado = { nome, ...v } } }) })
const { setAuthCookie } = await import('src/plugins/_jwt')
setAuthCookie(proxy, 'token-falso')
console.log('__COOKIE__' + JSON.stringify(capturado))
`

async function cookieCom(env) {
	const { stdout } = await runWithEnv(CAPTURA, env)
	const linha = stdout.split('\n').find(l => l.startsWith('__COOKIE__'))
	return JSON.parse(linha.replace('__COOKIE__', ''))
}

describe('setAuthCookie', () => {
	it('grava o token no cookie configurado', () => {
		const { proxy, gravado } = cookieProxy()

		setAuthCookie(proxy, 'jwt-assinado')

		expect(gravado[settings.COOKIE_NAME].value).toBe('jwt-assinado')
	})

	it('marca httpOnly para o token ficar fora do alcance do JavaScript', () => {
		const { proxy, gravado } = cookieProxy()

		setAuthCookie(proxy, 'jwt')

		expect(gravado[settings.COOKIE_NAME].httpOnly).toBe(true)
	})

	it('usa path raiz, sameSite e maxAge das configurações', () => {
		const { proxy, gravado } = cookieProxy()

		setAuthCookie(proxy, 'jwt')

		expect(gravado[settings.COOKIE_NAME]).toMatchObject({
			path: '/',
			sameSite: settings.COOKIE_SAMESITE,
			maxAge: settings.COOKIE_MAX_AGE,
			secure: settings.COOKIE_SECURE
		})
	})

	it('omite domain quando COOKIE_DOMAIN não está definido', () => {
		const { proxy, gravado } = cookieProxy()

		setAuthCookie(proxy, 'jwt')

		expect('domain' in gravado[settings.COOKIE_NAME]).toBe(false)
	})
})

describe('clearAuthCookie', () => {
	it('zera o valor e expira imediatamente', () => {
		const { proxy, gravado } = cookieProxy()

		clearAuthCookie(proxy)

		expect(gravado[settings.COOKIE_NAME]).toMatchObject({
			value: '',
			maxAge: 0
		})
	})

	it('repete os mesmos atributos da gravação — senão o browser ignora a remoção', () => {
		const { proxy, gravado } = cookieProxy()

		setAuthCookie(proxy, 'jwt')
		const aoGravar = { ...gravado[settings.COOKIE_NAME] }
		clearAuthCookie(proxy)
		const aoLimpar = gravado[settings.COOKIE_NAME]

		expect(aoLimpar.path).toBe(aoGravar.path)
		expect(aoLimpar.sameSite).toBe(aoGravar.sameSite)
		expect(aoLimpar.secure).toBe(aoGravar.secure)
		expect(aoLimpar.httpOnly).toBe(aoGravar.httpOnly)
	})
})

describe('atributos do cookie por ambiente (subprocesso)', () => {
	it('produção grava Secure', async () => {
		const cookie = await cookieCom({
			NODE_ENV: 'production',
			JWT_SECRET: 'segredo-forte',
			COOKIE_SECURE: null
		})

		expect(cookie.secure).toBe(true)
	})

	it('COOKIE_NAME customizado troca o nome do cookie', async () => {
		const cookie = await cookieCom({ COOKIE_NAME: 'sessao_app' })

		expect(cookie.nome).toBe('sessao_app')
	})

	it('COOKIE_DOMAIN definido aparece nos atributos', async () => {
		const cookie = await cookieCom({ COOKIE_DOMAIN: '.app.dev' })

		expect(cookie.domain).toBe('.app.dev')
	})

	it('COOKIE_SAMESITE=none é repassado', async () => {
		const cookie = await cookieCom({ COOKIE_SAMESITE: 'none' })

		expect(cookie.sameSite).toBe('none')
	})

	it('JWT_EXPIRES_IN=30m vira maxAge de 1800', async () => {
		const cookie = await cookieCom({ JWT_EXPIRES_IN: '30m' })

		expect(cookie.maxAge).toBe(1800)
	})
})
