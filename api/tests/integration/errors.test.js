import { describe, expect, it } from 'bun:test'
import { get, post, request } from '../helpers/app'
import { loginAs } from '../helpers/auth'
import { flushLogs, logEvents } from '../helpers/console'
import { card, uuidV7 } from '../helpers/factories'
import { prismaMock } from '../helpers/prisma-mock'

const CARDS = '/api/teste/cards'

describe('rota inexistente', () => {
	it('responde 404 no formato de erro da aplicação', async () => {
		const { status, body } = await get('/rota/que/nao/existe')

		expect(status).toBe(404)
		expect(body).toMatchObject({
			error: 'Não Encontrado',
			message: 'Rota não encontrada.',
			statusCode: 404,
			path: '/rota/que/nao/existe'
		})
		expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
	})

	it('método sem rota correspondente também cai em 404', async () => {
		const { status } = await request('/', { method: 'PATCH' })

		expect(status).toBe(404)
	})
})

describe('corpo malformado', () => {
	it('JSON quebrado vira 400 de parsing', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:create'] })

		const { status, body } = await post(CARDS, '{"title": ', { cookie })

		expect(status).toBe(400)
		expect(body.error).toBe('Erro de Parsing')
	})
})

describe('falha inesperada do banco', () => {
	function derrubarBanco() {
		const erro = new Error(
			"Invalid `prisma.card.findMany()` invocation:\n\nCan't reach database server"
		)
		erro.code = 'ECONNREFUSED'
		prismaMock.Card.findMany.mockRejectedValue(erro)
		prismaMock.Card.count.mockRejectedValue(erro)
	}

	it('responde 500 no formato padrão', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		derrubarBanco()

		const { status, body } = await get(`${CARDS}/all`, { cookie })

		expect(status).toBe(500)
		expect(body.statusCode).toBe(500)
		expect(body.path).toBe(`${CARDS}/all`)
	})

	it('não vaza stack trace no corpo da resposta', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		derrubarBanco()

		const { body } = await get(`${CARDS}/all`, { cookie })

		expect(JSON.stringify(body)).not.toContain('at ')
		expect(body.stack).toBeUndefined()
	})

	it('registra o erro com stack e código no log', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		derrubarBanco()

		await get(`${CARDS}/all`, {
			cookie,
			headers: { 'x-request-id': 'falha-db-1' }
		})

		const evento = logEvents().find(
			e => e.msg === 'erro não tratado' && e.reqId === 'falha-db-1'
		)
		expect(evento.level).toBe('error')
		expect(evento.statusCode).toBe(500)
		expect(evento.err.code).toBe('ECONNREFUSED')
		expect(evento.err.stack).toBeTruthy()
	})

	it('o mesmo reqId aparece no log de erro e no de acesso', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		derrubarBanco()

		await get(`${CARDS}/all`, {
			cookie,
			headers: { 'x-request-id': 'correlacao-1' }
		})
		await flushLogs()

		const eventos = logEvents().filter(e => e.reqId === 'correlacao-1')
		expect(eventos.map(e => e.msg)).toEqual(
			expect.arrayContaining(['erro não tratado', 'request'])
		)
	})

	it('a linha de acesso do 500 sai no nível error', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		derrubarBanco()

		await get(`${CARDS}/all`, {
			cookie,
			headers: { 'x-request-id': 'acesso-500' }
		})
		await flushLogs()

		const acesso = logEvents().find(
			e => e.msg === 'request' && e.reqId === 'acesso-500'
		)
		expect(acesso.level).toBe('error')
		expect(acesso.status).toBe(500)
	})
})

describe('resposta fora do contrato', () => {
	it('vira 500 de serialização — o schema quebrado é do servidor', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		// CardSchema exige title, description, createdAt e updatedAt.
		prismaMock.Card.findUnique.mockResolvedValue({ id: uuidV7() })

		const { status, body } = await get(`${CARDS}/${uuidV7()}`, { cookie })

		expect(status).toBe(500)
		expect(body.error).toBe('Erro de Serialização')
	})

	it('não descreve o schema para o cliente fora de desenvolvimento', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		prismaMock.Card.findUnique.mockResolvedValue({ id: uuidV7() })

		const { body } = await get(`${CARDS}/${uuidV7()}`, { cookie })

		expect(body.details).toBeUndefined()
	})
})

describe('CORS', () => {
	it('libera origem que está na allowlist', async () => {
		const { headers } = await get('/', {
			headers: { origin: 'http://localhost:5173' }
		})

		expect(headers.get('access-control-allow-origin')).toBe(
			'http://localhost:5173'
		)
		expect(headers.get('access-control-allow-credentials')).toBe('true')
	})

	it('não libera origem fora da allowlist', async () => {
		const { headers } = await get('/', {
			headers: { origin: 'http://localhost:5173.evil.com' }
		})

		expect(headers.get('access-control-allow-origin')).toBeNull()
	})

	it('a correspondência é exata, não por substring', async () => {
		const { headers } = await get('/', {
			headers: { origin: 'http://evil.localhost:5173' }
		})

		expect(headers.get('access-control-allow-origin')).toBeNull()
	})

	it('requisição sem Origin passa (curl, servidor a servidor)', async () => {
		const { status } = await get('/')

		expect(status).toBe(200)
	})
})

describe('log de erro operacional', () => {
	it('4xx sai como warn, sem stack', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		prismaMock.Card.findUnique.mockResolvedValue(null)

		await get(`${CARDS}/${uuidV7()}`, {
			cookie,
			headers: { 'x-request-id': 'nao-encontrado-1' }
		})

		const evento = logEvents().find(
			e => e.msg === 'erro operacional' && e.reqId === 'nao-encontrado-1'
		)
		expect(evento.level).toBe('warn')
		expect(evento.statusCode).toBe(404)
		expect(evento.err).toBeUndefined()
	})

	it('erro de validação vira warn com a lista de campos', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:create'] })

		await post(
			CARDS,
			{ description: 'sem título' },
			{ cookie, headers: { 'x-request-id': 'validacao-1' } }
		)

		const evento = logEvents().find(
			e => e.msg === 'erro de validação' && e.reqId === 'validacao-1'
		)
		expect(evento.level).toBe('warn')
		expect(evento.on).toBe('body')
		expect(evento.fields).toContain('title')
	})

	it('a linha de log cabe em uma linha só, mesmo com erro do Prisma', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		prismaMock.Card.findMany.mockRejectedValue(
			new Error('linha1\nlinha2\nlinha3'.repeat(50))
		)
		prismaMock.Card.count.mockRejectedValue(new Error('x'))

		await get(`${CARDS}/all`, {
			cookie,
			headers: { 'x-request-id': 'uma-linha-1' }
		})

		const evento = logEvents().find(e => e.reqId === 'uma-linha-1')
		expect(evento.err.message).not.toContain('\n')
		expect(evento.err.message.length).toBeLessThanOrEqual(301)
	})
})

describe('acesso bem-sucedido', () => {
	it('registra userId na linha de acesso quando há sessão', async () => {
		const { cookie, usuario } = await loginAs({ permissions: ['cards:read'] })
		prismaMock.Card.findMany.mockResolvedValue([card()])

		await get(`${CARDS}/all`, {
			cookie,
			headers: { 'x-request-id': 'com-usuario-1' }
		})
		await flushLogs()

		const acesso = logEvents().find(
			e => e.msg === 'request' && e.reqId === 'com-usuario-1'
		)
		expect(acesso.userId).toBe(usuario.id)
	})
})
