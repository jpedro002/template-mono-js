import { describe, expect, it } from 'bun:test'
import { settings } from 'src/config'
import { runWithEnv } from '../helpers/subprocess'

const DUMP = `
const { settings } = await import('src/config')
console.log('__SETTINGS__' + JSON.stringify(settings))
`

async function settingsCom(env) {
	const { stdout, stderr, exitCode } = await runWithEnv(DUMP, env)
	const linha = stdout.split('\n').find(l => l.startsWith('__SETTINGS__'))
	return {
		settings: linha ? JSON.parse(linha.replace('__SETTINGS__', '')) : null,
		stderr,
		exitCode
	}
}

describe('settings — ambiente de teste carregado', () => {
	it('usa os valores definidos pelo preload', () => {
		expect(settings.NODE_ENV).toBe('test')
		expect(settings.COOKIE_NAME).toBe('access_token')
		expect(settings.COOKIE_SAMESITE).toBe('lax')
		expect(settings.COOKIE_SECURE).toBe(false)
		expect(settings.LOG_PRETTY).toBe(false)
	})
})

describe('settings — COOKIE_MAX_AGE derivado de JWT_EXPIRES_IN', () => {
	const casos = [
		['24h', 86400],
		['30m', 1800],
		['7d', 604800],
		['45s', 45],
		['3600', 3600],
		['  12h  ', 43200],
		['para-sempre', 86400],
		['', 86400]
	]

	for (const [entrada, esperado] of casos) {
		it(`'${entrada}' vira ${esperado}s`, async () => {
			const { settings } = await settingsCom({ JWT_EXPIRES_IN: entrada })
			expect(settings.COOKIE_MAX_AGE).toBe(esperado)
		})
	}
})

describe('settings — JWT_SECRET', () => {
	it('derruba o processo em produção sem segredo definido', async () => {
		const { exitCode, stderr } = await settingsCom({
			NODE_ENV: 'production',
			JWT_SECRET: ''
		})

		expect(exitCode).not.toBe(0)
		expect(stderr).toContain('JWT_SECRET é obrigatório em produção')
	})

	it('avisa (sem derrubar) fora de produção', async () => {
		const { settings, exitCode, stderr } = await settingsCom({
			NODE_ENV: 'development',
			JWT_SECRET: ''
		})

		expect(exitCode).toBe(0)
		expect(stderr).toContain('JWT_SECRET não definido')
		expect(settings.JWT_SECRET).toBe('dev_only_insecure_secret_change_me')
	})

	it('não avisa quando o segredo está definido', async () => {
		const { stderr } = await settingsCom({ JWT_SECRET: 'segredo-forte' })

		expect(stderr).not.toContain('JWT_SECRET não definido')
	})
})

describe('settings — padrões por ambiente', () => {
	it('produção liga COOKIE_SECURE e desliga o log legível', async () => {
		const { settings } = await settingsCom({
			NODE_ENV: 'production',
			JWT_SECRET: 'segredo-forte',
			COOKIE_SECURE: null,
			LOG_PRETTY: null,
			LOG_LEVEL: null
		})

		expect(settings.COOKIE_SECURE).toBe(true)
		expect(settings.LOG_PRETTY).toBe(false)
		expect(settings.LOG_LEVEL).toBe('info')
	})

	it('desenvolvimento desliga COOKIE_SECURE e liga o log legível', async () => {
		const { settings } = await settingsCom({
			NODE_ENV: 'development',
			COOKIE_SECURE: null,
			LOG_PRETTY: null,
			LOG_LEVEL: null
		})

		expect(settings.COOKIE_SECURE).toBe(false)
		expect(settings.LOG_PRETTY).toBe(true)
		expect(settings.LOG_LEVEL).toBe('debug')
	})

	it('COOKIE_SECURE explícito vence o padrão do ambiente', async () => {
		const { settings } = await settingsCom({
			NODE_ENV: 'production',
			JWT_SECRET: 'segredo-forte',
			COOKIE_SECURE: 'false'
		})

		expect(settings.COOKIE_SECURE).toBe(false)
	})

	it('COOKIE_DOMAIN vazio vira undefined', async () => {
		const { settings } = await settingsCom({ COOKIE_DOMAIN: '' })

		expect(settings.COOKIE_DOMAIN).toBeUndefined()
	})
})

describe('settings — aviso de CSRF', () => {
	it('avisa quando SameSite=none derruba a proteção do cookie', async () => {
		const { stderr } = await settingsCom({ COOKIE_SAMESITE: 'none' })

		expect(stderr).toContain('COOKIE_SAMESITE=none')
		expect(stderr).toContain('CSRF')
	})

	it('não avisa com SameSite=lax', async () => {
		const { stderr } = await settingsCom({ COOKIE_SAMESITE: 'lax' })

		expect(stderr).not.toContain('COOKIE_SAMESITE=none')
	})
})
