import { describe, expect, it } from 'bun:test'
import { get } from '../helpers/app'
import { flushLogs, logEvents } from '../helpers/console'
import { prismaMock } from '../helpers/prisma-mock'

describe('rota raiz e infraestrutura de request', () => {
	it('GET / e /healthz respondem vivo sem tocar no banco', async () => {
		prismaMock.$queryRaw.mockRejectedValue(new Error('banco fora'))
		for (const rota of ['/', '/healthz']) {
			const { status, body } = await get(rota)
			expect(status).toBe(200)
			expect(body).toEqual({ status: 'ok' })
		}
		prismaMock.$queryRaw.mockReset()
	})

	it('GET /ready responde ok com banco de pé', async () => {
		const { status, body } = await get('/ready')

		expect(status).toBe(200)
		expect(body).toEqual({ status: 'ok' })
	})

	it('GET /ready responde 503 sem expor o erro quando o banco cai', async () => {
		prismaMock.$queryRaw.mockRejectedValueOnce(
			new Error('connect ECONNREFUSED 10.0.0.5:5432')
		)
		const { status, body } = await get('/ready')

		expect(status).toBe(503)
		expect(body).toEqual({ status: 'indisponivel' })
	})

	it('GET /version exige sessão', async () => {
		const { status } = await get('/version')

		expect(status).toBe(401)
	})

	it('devolve x-request-id em toda resposta', async () => {
		const { headers } = await get('/')

		expect(headers.get('x-request-id')).toMatch(/^[0-9a-f]{8}$/)
	})

	it('reaproveita o x-request-id enviado pelo cliente', async () => {
		const { headers } = await get('/', {
			headers: { 'x-request-id': 'trace-externo-1' }
		})

		expect(headers.get('x-request-id')).toBe('trace-externo-1')
	})

	it('registra uma linha de acesso com método, path, status e duração', async () => {
		await get('/', { headers: { 'x-request-id': 'acesso-1' } })
		await flushLogs()

		const evento = logEvents().find(e => e.reqId === 'acesso-1')

		expect(evento).toMatchObject({
			level: 'info',
			msg: 'request',
			method: 'GET',
			path: '/',
			status: 200
		})
		expect(evento.durationMs).toBeGreaterThanOrEqual(0)
	})

	it('não registra acesso para /docs', async () => {
		await get('/docs')
		await flushLogs()

		expect(logEvents().filter(e => e.msg === 'request')).toHaveLength(0)
	})
})
