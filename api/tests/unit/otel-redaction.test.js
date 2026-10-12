import { describe, expect, it } from 'bun:test'
import {
	createRedactingSpanProcessor,
	redigirAtributos
} from 'src/helpers/_otel-redaction.helper'

/**
 * O que está sendo protegido aqui é concreto: o `@elysiajs/opentelemetry` anexa
 * ao span raiz um atributo por header (inclusive `cookie`), os cookies e o corpo
 * da requisição. Sem esta redação, o trace de um login sai com a senha em texto
 * puro e o de qualquer requisição autenticada sai com o JWT de sessão.
 */
describe('redigirAtributos — chave que denuncia segredo', () => {
	it('redige o header de cookie, que carrega o JWT de sessão', () => {
		const attrs = { 'http.request.header.cookie': 'access_token=eyJhbGciOi...' }

		redigirAtributos(attrs)

		expect(attrs['http.request.header.cookie']).toBe('[REDACTED]')
	})

	it('redige authorization e set-cookie', () => {
		const attrs = {
			'http.request.header.authorization': 'Bearer eyJhbGciOi...',
			'http.response.header.set-cookie': 'access_token=eyJ; HttpOnly'
		}

		redigirAtributos(attrs)

		expect(attrs['http.request.header.authorization']).toBe('[REDACTED]')
		expect(attrs['http.response.header.set-cookie']).toBe('[REDACTED]')
	})

	it('usa os mesmos radicais do logger, então pega nome composto', () => {
		const attrs = {
			'app.senha_atual': 'segredo',
			'app.currentPassword': 'segredo',
			'app.apiKey': 'segredo'
		}

		redigirAtributos(attrs)

		expect(Object.values(attrs)).toEqual([
			'[REDACTED]',
			'[REDACTED]',
			'[REDACTED]'
		])
	})

	it('não mexe no que é diagnóstico legítimo', () => {
		const attrs = {
			'http.route': '/api/seguranca/users/:id',
			'http.response.status_code': 200,
			'db.statement': 'SELECT id FROM seguranca.users WHERE id = $1'
		}

		redigirAtributos(attrs)

		expect(attrs['http.route']).toBe('/api/seguranca/users/:id')
		expect(attrs['http.response.status_code']).toBe(200)
		expect(attrs['db.statement']).toContain('SELECT id')
	})
})

describe('redigirAtributos — corpo serializado', () => {
	/**
	 * Corpo é **removido**, não redigido: o segredo está dentro de uma string
	 * JSON, onde casamento por nome de chave não alcança. O corpo das mutações já
	 * é auditado no log de acesso, com redação recursiva e corte de 4 KB.
	 */
	it('remove o corpo da requisição em vez de tentar redigir por dentro', () => {
		const attrs = {
			'http.request.body': JSON.stringify({
				email: 'joao@teste',
				password: 'senha-em-texto-puro'
			})
		}

		redigirAtributos(attrs)

		expect('http.request.body' in attrs).toBe(false)
		expect(JSON.stringify(attrs)).not.toContain('senha-em-texto-puro')
	})

	it('remove o corpo da resposta e o cookie inteiro', () => {
		const attrs = {
			'http.response.body': '{"user":{"id":"1"}}',
			'http.request.cookie': '{"access_token":"eyJhbGciOi..."}'
		}

		redigirAtributos(attrs)

		expect(attrs).toEqual({})
	})

	it('mantém o tamanho do corpo, que é métrica e não conteúdo', () => {
		const attrs = { 'http.request.body.size': 42 }

		redigirAtributos(attrs)

		expect(attrs['http.request.body.size']).toBe(42)
	})
})

describe('redigirAtributos — contrato', () => {
	it('devolve quantos atributos foram alterados ou removidos', () => {
		const alterados = redigirAtributos({
			'http.request.body': '{}',
			'http.request.header.cookie': 'x=1',
			'http.route': '/'
		})

		expect(alterados).toBe(2)
	})

	it('tolera ausência de atributos sem lançar', () => {
		expect(redigirAtributos(undefined)).toBe(0)
		expect(redigirAtributos(null)).toBe(0)
		expect(redigirAtributos('não é objeto')).toBe(0)
	})
})

describe('createRedactingSpanProcessor', () => {
	it('redige no onEnd, no próprio objeto que o exportador vai serializar', () => {
		const processor = createRedactingSpanProcessor()
		const span = {
			attributes: {
				'http.request.header.cookie': 'access_token=eyJ',
				'http.request.body': '{"password":"x"}'
			}
		}

		processor.onStart(span)
		processor.onEnd(span)

		expect(span.attributes['http.request.header.cookie']).toBe('[REDACTED]')
		expect('http.request.body' in span.attributes).toBe(false)
	})

	it('cumpre o resto do contrato de SpanProcessor', async () => {
		const processor = createRedactingSpanProcessor()

		await expect(processor.forceFlush()).resolves.toBeUndefined()
		await expect(processor.shutdown()).resolves.toBeUndefined()
	})
})
