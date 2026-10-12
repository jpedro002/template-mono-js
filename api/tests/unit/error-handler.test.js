import { afterEach, describe, expect, it } from 'bun:test'
import { errorHandler } from 'src/helpers'
import { logEvents } from '../helpers/console'
import { prismaError } from '../helpers/prisma-mock'

function tratar(overrides = {}) {
	const set = { status: null, headers: {} }
	const body = errorHandler({
		code: 'UNKNOWN',
		error: new Error('falha'),
		set,
		path: '/api/teste',
		request: { method: 'GET' },
		reqId: 'req-1',
		...overrides
	})
	return { body, set }
}

/** ValidationError da Elysia: cada issue do schema vira um item em `all`. */
function erroValidacao(type = 'body', issues = []) {
	return {
		type,
		message: JSON.stringify({ type, errors: issues }),
		expected: {},
		all: issues
	}
}

afterEach(() => {
	process.env.NODE_ENV = 'test'
})

describe('errorHandler — validação de entrada', () => {
	it('responde 400 (não o 422 padrão da Elysia)', () => {
		const { body, set } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('body', [
				{ path: '/email', message: 'Email inválido', summary: 's', value: 1 }
			])
		})

		expect(set.status).toBe(400)
		expect(body.statusCode).toBe(400)
		expect(body.error).toBe('Erro de Validação')
	})

	it('normaliza o caminho do campo', () => {
		const { body } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('body', [
				{ path: '/usuario/email', message: 'Email inválido' }
			])
		})

		expect(body.details.errors[0].field).toBe('usuario.email')
	})

	it('conta os erros e sugere a correção', () => {
		const { body } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('body', [
				{ path: '/email', message: 'a' },
				{ path: '/password', message: 'b' }
			])
		})

		expect(body.details.totalErrors).toBe(2)
		expect(body.details.hint).toContain('Verifique os campos')
	})

	it('usa o tipo de validação quando a issue não tem caminho', () => {
		const { body } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('params', [{ message: 'inválido' }])
		})

		expect(body.details.errors[0].field).toBe('params')
	})

	it('aceita ZodError cru fora do ciclo de vida da Elysia', () => {
		const { body, set } = tratar({
			code: 'VALIDATION',
			error: {
				type: 'body',
				issues: [
					{
						path: ['usuario', 'email'],
						message: 'Email inválido',
						code: 'invalid_string'
					}
				]
			}
		})

		expect(set.status).toBe(400)
		expect(body.details.errors[0]).toMatchObject({
			field: 'usuario.email',
			message: 'Email inválido',
			keyword: 'invalid_string'
		})
	})
})

describe('errorHandler — validação da resposta', () => {
	it('vira 500: o contrato quebrado é do servidor', () => {
		const { body, set } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('response', [{ path: '/data', message: 'x' }])
		})

		expect(set.status).toBe(500)
		expect(body.error).toBe('Erro de Serialização')
		expect(body.message).toContain('não corresponde ao schema')
	})

	it('esconde os detalhes fora de desenvolvimento', () => {
		const { body } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('response', [{ path: '/data', message: 'x' }])
		})

		expect(body.details).toBeUndefined()
	})

	it('expõe os detalhes em desenvolvimento', () => {
		process.env.NODE_ENV = 'development'

		const { body } = tratar({
			code: 'VALIDATION',
			error: erroValidacao('response', [{ path: '/data', message: 'x' }])
		})

		expect(body.details.errors).toHaveLength(1)
	})
})

describe('errorHandler — erros do Prisma', () => {
	it('P2025 (registro ausente) vira 404', () => {
		const { body, set } = tratar({ error: prismaError('P2025') })

		expect(set.status).toBe(404)
		expect(body.error).toBe('Não Encontrado')
	})

	it('P2002 (unique) vira 409 e diz qual campo colidiu', () => {
		const { body, set } = tratar({
			error: prismaError('P2002', { target: ['email'] })
		})

		expect(set.status).toBe(409)
		expect(body.error).toBe('Conflito de Dados')
		expect(body.message).toContain('email')
	})

	it('P2003 (chave estrangeira) vira 400', () => {
		const { body, set } = tratar({ error: prismaError('P2003') })

		expect(set.status).toBe(400)
		expect(body.error).toBe('Erro de Integridade')
	})

	it('código desconhecido continua 500', () => {
		const { body, set } = tratar({ error: prismaError('P9999') })

		expect(set.status).toBe(500)
		expect(body.message).toContain('Erro no banco de dados')
	})
})

describe('errorHandler — erros do roteador', () => {
	it('NOT_FOUND vira 404 com mensagem de rota', () => {
		const { body, set } = tratar({ code: 'NOT_FOUND', error: new Error('x') })

		expect(set.status).toBe(404)
		expect(body.message).toBe('Rota não encontrada.')
	})

	it('PARSE vira 400', () => {
		const { body, set } = tratar({ code: 'PARSE', error: new Error('x') })

		expect(set.status).toBe(400)
		expect(body.error).toBe('Erro de Parsing')
	})
})

describe('errorHandler — formato da resposta', () => {
	it('respeita statusCode definido no erro pelo controller', () => {
		const erro = new Error('Registro não localizado.')
		erro.statusCode = 404

		const { body, set } = tratar({ error: erro })

		expect(set.status).toBe(404)
		expect(body.message).toBe('Registro não localizado.')
	})

	it('cai em 500 quando o erro não diz nada', () => {
		const { set } = tratar({ error: {} })

		expect(set.status).toBe(500)
	})

	it('carrega path e timestamp ISO', () => {
		const { body } = tratar({ path: '/api/seguranca/usuarios' })

		expect(body.path).toBe('/api/seguranca/usuarios')
		expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
	})

	it('omite details quando não há o que detalhar', () => {
		const { body } = tratar({})

		expect(body.details).toBeUndefined()
	})
})

describe('errorHandler — log', () => {
	const ultimo = () => logEvents().at(-1)

	it('5xx sai como error, com stack e reqId', () => {
		tratar({ error: new Error('explodiu') })

		const evento = ultimo()
		expect(evento.level).toBe('error')
		expect(evento.msg).toBe('erro não tratado')
		expect(evento.reqId).toBe('req-1')
		expect(evento.err.stack).toContain('explodiu')
	})

	it('validação vira warn enxuto com a lista de campos', () => {
		tratar({
			code: 'VALIDATION',
			error: erroValidacao('body', [
				{ path: '/email', message: 'a' },
				{ path: '/password', message: 'b' }
			])
		})

		const evento = ultimo()
		expect(evento.level).toBe('warn')
		expect(evento.msg).toBe('erro de validação')
		expect(evento.on).toBe('body')
		expect(evento.fields).toBe('email,password')
	})

	it('não despeja o JSON cru da validação no log', () => {
		tratar({
			code: 'VALIDATION',
			error: erroValidacao('body', [{ path: '/email', message: 'a' }])
		})

		expect(ultimo().message).toBeUndefined()
	})

	it('4xx operacional vira warn com a mensagem', () => {
		tratar({ error: prismaError('P2025') })

		const evento = ultimo()
		expect(evento.level).toBe('warn')
		expect(evento.msg).toBe('erro operacional')
		expect(evento.statusCode).toBe(404)
	})

	it('registra método e path para correlacionar com o log de acesso', () => {
		tratar({
			error: new Error('x'),
			path: '/api/teste',
			request: { method: 'POST' }
		})

		expect(ultimo()).toMatchObject({ method: 'POST', path: '/api/teste' })
	})
})
