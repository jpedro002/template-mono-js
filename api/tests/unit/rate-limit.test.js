import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import { rateLimit, rateLimitCheck, rateLimitHit } from 'src/plugins'

/**
 * Os buckets vivem no escopo do módulo e o `bun test` roda todos os arquivos no
 * mesmo processo — cada teste usa um `keyPrefix` próprio para não herdar a
 * contagem de outro.
 */
function contexto(ip = '10.0.0.1') {
	return {
		server: { requestIP: () => ({ address: ip }) },
		request: new Request('http://localhost/'),
		set: { headers: {} }
	}
}

async function bater(handler, ctx) {
	const resultado = await handler(ctx)
	return {
		bloqueado: Boolean(resultado),
		resposta: resultado,
		headers: ctx.set.headers
	}
}

afterEach(() => {
	setSystemTime()
})

describe('rateLimit — contagem na janela', () => {
	it('libera até o limite configurado', async () => {
		const limite = rateLimit({ max: 3, windowMs: 60_000, keyPrefix: 'rl-ok' })

		for (let i = 0; i < 3; i++) {
			const { bloqueado } = await bater(limite, contexto())
			expect(bloqueado).toBe(false)
		}
	})

	it('bloqueia a requisição seguinte com 429', async () => {
		const limite = rateLimit({ max: 2, windowMs: 60_000, keyPrefix: 'rl-429' })

		await bater(limite, contexto())
		await bater(limite, contexto())
		const { resposta } = await bater(limite, contexto())

		expect(resposta.code).toBe(429)
		expect(resposta.response).toMatchObject({
			error: 'Too Many Requests',
			statusCode: 429
		})
	})

	it('continua bloqueando depois de estourar', async () => {
		const limite = rateLimit({
			max: 1,
			windowMs: 60_000,
			keyPrefix: 'rl-persist'
		})

		await bater(limite, contexto())
		const primeira = await bater(limite, contexto())
		const segunda = await bater(limite, contexto())

		expect(primeira.bloqueado).toBe(true)
		expect(segunda.bloqueado).toBe(true)
	})
})

describe('rateLimit — headers informativos', () => {
	it('publica limite e saldo restante', async () => {
		const limite = rateLimit({ max: 5, windowMs: 60_000, keyPrefix: 'rl-head' })

		const { headers } = await bater(limite, contexto())

		expect(headers['x-ratelimit-limit']).toBe('5')
		expect(headers['x-ratelimit-remaining']).toBe('4')
	})

	it('decrementa o saldo a cada requisição', async () => {
		const limite = rateLimit({ max: 3, windowMs: 60_000, keyPrefix: 'rl-dec' })

		const saldos = []
		for (let i = 0; i < 3; i++) {
			const { headers } = await bater(limite, contexto())
			saldos.push(headers['x-ratelimit-remaining'])
		}

		expect(saldos).toEqual(['2', '1', '0'])
	})

	it('não deixa o saldo ficar negativo', async () => {
		const limite = rateLimit({ max: 1, windowMs: 60_000, keyPrefix: 'rl-neg' })

		await bater(limite, contexto())
		await bater(limite, contexto())
		const { headers } = await bater(limite, contexto())

		expect(headers['x-ratelimit-remaining']).toBe('0')
	})
})

describe('rateLimit — isolamento de chave', () => {
	it('conta cada IP separadamente', async () => {
		const limite = rateLimit({ max: 1, windowMs: 60_000, keyPrefix: 'rl-ip' })

		await bater(limite, contexto('1.1.1.1'))
		const outroIp = await bater(limite, contexto('2.2.2.2'))

		expect(outroIp.bloqueado).toBe(false)
	})

	it('conta cada keyPrefix separadamente', async () => {
		const login = rateLimit({ max: 1, windowMs: 60_000, keyPrefix: 'rl-a' })
		const geral = rateLimit({ max: 1, windowMs: 60_000, keyPrefix: 'rl-b' })

		await bater(login, contexto('3.3.3.3'))
		const outroEscopo = await bater(geral, contexto('3.3.3.3'))

		expect(outroEscopo.bloqueado).toBe(false)
	})

	it('cai para "unknown" quando o IP não está disponível', async () => {
		const limite = rateLimit({
			max: 1,
			windowMs: 60_000,
			keyPrefix: 'rl-unknown'
		})

		const semServer = {
			request: new Request('http://localhost/'),
			set: { headers: {} }
		}
		const primeira = await bater(limite, semServer)
		const segunda = await bater(limite, {
			request: new Request('http://localhost/'),
			set: { headers: {} }
		})

		// Sem IP todos caem na mesma chave — é o comportamento esperado atrás de
		// `app.handle()` e em testes.
		expect(primeira.bloqueado).toBe(false)
		expect(segunda.bloqueado).toBe(true)
	})
})

describe('rateLimit — expiração da janela', () => {
	it('zera a contagem quando a janela passa', async () => {
		const agora = new Date('2026-08-17T12:00:00.000Z')
		setSystemTime(agora)

		const limite = rateLimit({
			max: 1,
			windowMs: 60_000,
			keyPrefix: 'rl-janela'
		})

		await bater(limite, contexto('4.4.4.4'))
		expect((await bater(limite, contexto('4.4.4.4'))).bloqueado).toBe(true)

		setSystemTime(new Date(agora.getTime() + 61_000))

		expect((await bater(limite, contexto('4.4.4.4'))).bloqueado).toBe(false)
	})

	it('mantém o bloqueio dentro da janela', async () => {
		const agora = new Date('2026-08-17T12:00:00.000Z')
		setSystemTime(agora)

		const limite = rateLimit({
			max: 1,
			windowMs: 60_000,
			keyPrefix: 'rl-dentro'
		})

		await bater(limite, contexto('5.5.5.5'))
		setSystemTime(new Date(agora.getTime() + 59_000))

		expect((await bater(limite, contexto('5.5.5.5'))).bloqueado).toBe(true)
	})
})

describe('rateLimitCheck + rateLimitHit — cota gasta só pela falha', () => {
	const opts = { max: 2, windowMs: 60_000, keyPrefix: 'rl-check' }

	it('checar sem registrar não gasta cota', async () => {
		const checar = rateLimitCheck(opts)

		for (let i = 0; i < 10; i++) {
			expect((await bater(checar, contexto('7.7.7.7'))).bloqueado).toBe(false)
		}
	})

	it('bloqueia quando as falhas registradas atingem o limite', async () => {
		const checar = rateLimitCheck({ ...opts, keyPrefix: 'rl-check-hit' })
		const registrar = rateLimitHit({ ...opts, keyPrefix: 'rl-check-hit' })

		await bater(checar, contexto('8.8.8.8'))
		registrar(contexto('8.8.8.8'))
		expect((await bater(checar, contexto('8.8.8.8'))).bloqueado).toBe(false)

		registrar(contexto('8.8.8.8'))

		const terceira = await bater(checar, contexto('8.8.8.8'))
		expect(terceira.bloqueado).toBe(true)
		expect(terceira.resposta.code).toBe(429)
	})

	it('publica o saldo pelas falhas, não pelas checagens', async () => {
		const chave = { ...opts, max: 5, keyPrefix: 'rl-check-head' }
		const checar = rateLimitCheck(chave)
		const registrar = rateLimitHit(chave)

		await bater(checar, contexto('9.9.9.9'))
		registrar(contexto('9.9.9.9'))
		const { headers } = await bater(checar, contexto('9.9.9.9'))

		expect(headers['x-ratelimit-limit']).toBe('5')
		expect(headers['x-ratelimit-remaining']).toBe('4')
	})

	it('registrar não devolve nada — valor viraria a resposta no afterHandle', () => {
		const registrar = rateLimitHit({ ...opts, keyPrefix: 'rl-check-void' })

		expect(registrar(contexto('9.9.9.10'))).toBeUndefined()
	})

	it('a janela das falhas expira', async () => {
		const agora = new Date('2026-08-17T12:00:00.000Z')
		setSystemTime(agora)

		const chave = { max: 1, windowMs: 60_000, keyPrefix: 'rl-check-janela' }
		const checar = rateLimitCheck(chave)
		const registrar = rateLimitHit(chave)

		registrar(contexto('9.9.9.11'))
		expect((await bater(checar, contexto('9.9.9.11'))).bloqueado).toBe(true)

		setSystemTime(new Date(agora.getTime() + 61_000))

		expect((await bater(checar, contexto('9.9.9.11'))).bloqueado).toBe(false)
	})

	it('separa os baldes por keyBy', async () => {
		const chave = {
			max: 1,
			windowMs: 60_000,
			keyPrefix: 'rl-check-keyby',
			keyBy: ({ body }) => body?.email
		}
		const checar = rateLimitCheck(chave)
		const registrar = rateLimitHit(chave)

		const alvo = { ...contexto(), body: { email: 'a@t.dev' } }
		const vizinho = {
			...contexto(),
			body: { email: 'b@t.dev' },
			set: { headers: {} }
		}

		registrar(alvo)

		expect((await bater(checar, alvo)).bloqueado).toBe(true)
		expect((await bater(checar, vizinho)).bloqueado).toBe(false)
	})
})

describe('rateLimit — padrões', () => {
	it('usa max 100 quando nada é informado', async () => {
		const limite = rateLimit()

		const { headers } = await bater(limite, contexto('6.6.6.6'))

		expect(headers['x-ratelimit-limit']).toBe('100')
	})
})
