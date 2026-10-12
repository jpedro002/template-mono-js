import { describe, expect, it } from 'bun:test'
import { logger } from 'src/helpers'
import { consoleLines, logEvents } from '../helpers/console'
import { jsonLines, runWithEnv } from '../helpers/subprocess'

const ultimo = () => logEvents().at(-1)

describe('logger — formato', () => {
	it('emite um JSON por linha com level, time e msg', () => {
		logger.info('algo aconteceu')

		const evento = ultimo()
		expect(evento.level).toBe('info')
		expect(evento.msg).toBe('algo aconteceu')
		expect(new Date(evento.time).toISOString()).toBe(evento.time)
	})

	it('mantém os campos extras no mesmo objeto', () => {
		logger.info('request', { method: 'GET', status: 200 })

		expect(ultimo()).toMatchObject({ method: 'GET', status: 200 })
	})

	it('manda erro para console.error e o resto para console.log', () => {
		logger.info('normal')
		logger.error('falhou')

		expect(consoleLines('log').some(l => l.includes('normal'))).toBe(true)
		expect(consoleLines('error').some(l => l.includes('falhou'))).toBe(true)
	})

	it('escreve exatamente uma linha por evento', () => {
		logger.warn('multi\nlinha', { detalhe: 'a\nb\nc' })

		expect(consoleLines().at(-1).includes('\n')).toBe(false)
	})
})

describe('logger — redação de dados sensíveis', () => {
	it('esconde chaves sensíveis no primeiro nível', () => {
		logger.info('login', { email: 'a@b.dev', password: 'segredo123' })

		expect(ultimo()).toMatchObject({
			email: 'a@b.dev',
			password: '[REDACTED]'
		})
	})

	it('esconde chaves sensíveis aninhadas', () => {
		logger.info('req', {
			headers: { authorization: 'Bearer x', cookie: 'access_token=y' },
			body: { user: { senha: 'p' } }
		})

		const evento = ultimo()
		expect(evento.headers.authorization).toBe('[REDACTED]')
		expect(evento.headers.cookie).toBe('[REDACTED]')
		expect(evento.body.user.senha).toBe('[REDACTED]')
	})

	it('esconde chaves sensíveis dentro de arrays', () => {
		logger.info('lote', { itens: [{ token: 'abc' }, { token: 'def' }] })

		expect(ultimo().itens).toEqual([
			{ token: '[REDACTED]' },
			{ token: '[REDACTED]' }
		])
	})

	it('ignora a diferença de maiúsculas na chave', () => {
		logger.info('req', { Authorization: 'Bearer x', PASSWORD: 'y' })

		expect(ultimo()).toMatchObject({
			Authorization: '[REDACTED]',
			PASSWORD: '[REDACTED]'
		})
	})

	it('trunca depois de 3 níveis em vez de devolver o valor cru', () => {
		logger.info('fundo', { a: { b: { c: { d: { password: 'visível' } } } } })

		// O corte existe para não percorrer objetos gigantes (ex: um Prisma client
		// inteiro), mas devolver o valor cru vazava tudo abaixo do limite sem
		// passar pela redação.
		expect(ultimo().a.b.c.d).toBe('[TRUNCATED]')
	})

	it('esconde compostos de senha em português', () => {
		logger.info('troca', {
			senha_atual: 'a',
			nova_senha: 'b',
			confirmar_senha: 'c'
		})

		expect(ultimo()).toMatchObject({
			senha_atual: '[REDACTED]',
			nova_senha: '[REDACTED]',
			confirmar_senha: '[REDACTED]'
		})
	})

	it('esconde os compostos que o sistema antigo redigia', () => {
		logger.info('req', {
			password_confirmation: 'a',
			current_password: 'b',
			refresh_token: 'c',
			api_key: 'd',
			card_number: 'e',
			cvv: 'f'
		})

		const evento = ultimo()
		for (const campo of [
			'password_confirmation',
			'current_password',
			'refresh_token',
			'api_key',
			'card_number',
			'cvv'
		]) {
			expect(evento[campo]).toBe('[REDACTED]')
		}
	})

	it('não redige campo de negócio parecido', () => {
		logger.info('req', { cardId: 'abc', cpf: '000', descricao: 'x' })

		expect(ultimo()).toMatchObject({
			cardId: 'abc',
			cpf: '000',
			descricao: 'x'
		})
	})
})

describe('logger — achatamento e corte', () => {
	it('achata quebras de linha em espaço', () => {
		logger.info('msg', { texto: 'linha1\n  linha2\n\tlinha3' })

		expect(ultimo().texto).toBe('linha1 linha2 linha3')
	})

	it('corta strings acima de 300 caracteres', () => {
		logger.info('msg', { texto: 'x'.repeat(500) })

		const { texto } = ultimo()
		expect(texto).toHaveLength(301)
		expect(texto.endsWith('…')).toBe(true)
	})

	it('não mexe em strings dentro do limite', () => {
		logger.info('msg', { texto: 'curto' })

		expect(ultimo().texto).toBe('curto')
	})

	it('preserva números e booleanos', () => {
		logger.info('msg', { status: 404, ok: false, nulo: null })

		expect(ultimo()).toMatchObject({ status: 404, ok: false, nulo: null })
	})
})

describe('logger — serialização de erro', () => {
	it('extrai type, message e stack de um Error', () => {
		const erro = new TypeError('deu ruim')
		logger.error('falhou', { err: erro })

		const { err } = ultimo()
		expect(err.type).toBe('TypeError')
		expect(err.message).toBe('deu ruim')
		expect(err.stack).toContain('TypeError: deu ruim')
	})

	it('inclui code e statusCode quando existem', () => {
		const erro = new Error('sem conexão')
		erro.code = 'ECONNREFUSED'
		erro.statusCode = 503
		logger.error('falhou', { err: erro })

		expect(ultimo().err).toMatchObject({
			code: 'ECONNREFUSED',
			statusCode: 503
		})
	})

	it('achata mensagem multi-linha do erro', () => {
		logger.error('falhou', {
			err: new Error(
				'Invalid `prisma.user.findFirst()`\n\ninvocation:\n  linha'
			)
		})

		expect(ultimo().err.message).toBe(
			'Invalid `prisma.user.findFirst()` invocation: linha'
		)
	})

	it('aceita valor que não é Error', () => {
		logger.error('falhou', { err: 'string solta' })

		expect(ultimo().err).toEqual({ message: 'string solta' })
	})

	it('não emite campo err quando ele é ausente', () => {
		logger.info('ok')

		expect('err' in ultimo()).toBe(false)
	})
})

describe('logger — child', () => {
	it('carrega os campos fixos em toda chamada', () => {
		const log = logger.child({ reqId: 'abc123' })

		log.info('primeira')
		expect(ultimo().reqId).toBe('abc123')

		log.warn('segunda')
		expect(ultimo().reqId).toBe('abc123')
	})

	it('acumula campos ao encadear child', () => {
		logger.child({ reqId: 'r1' }).child({ userId: 'u1' }).info('ok')

		expect(ultimo()).toMatchObject({ reqId: 'r1', userId: 'u1' })
	})

	it('deixa os campos da chamada sobrescreverem os fixos', () => {
		logger.child({ reqId: 'antigo' }).info('ok', { reqId: 'novo' })

		expect(ultimo().reqId).toBe('novo')
	})

	it('não contamina o logger raiz', () => {
		logger.child({ reqId: 'r1' }).info('com')
		logger.info('sem')

		expect('reqId' in ultimo()).toBe(false)
	})
})

const SCRIPT_NIVEIS = `
const { logger } = await import('src/helpers/_logger.helper')
logger.debug('nivel-debug')
logger.info('nivel-info')
logger.warn('nivel-warn')
logger.error('nivel-error')
`

describe('logger — nível e modo (subprocesso)', () => {
	it('LOG_LEVEL=warn descarta debug e info', async () => {
		const { stdout, stderr } = await runWithEnv(SCRIPT_NIVEIS, {
			LOG_LEVEL: 'warn',
			LOG_PRETTY: 'false'
		})

		const mensagens = jsonLines(stdout + stderr).map(e => e.msg)
		expect(mensagens).toEqual(['nivel-warn', 'nivel-error'])
	})

	it('LOG_LEVEL=debug deixa tudo passar', async () => {
		const { stdout, stderr } = await runWithEnv(SCRIPT_NIVEIS, {
			LOG_LEVEL: 'debug',
			LOG_PRETTY: 'false'
		})

		expect(jsonLines(stdout + stderr)).toHaveLength(4)
	})

	it('nível inválido cai no padrão info', async () => {
		const { stdout, stderr } = await runWithEnv(SCRIPT_NIVEIS, {
			LOG_LEVEL: 'trace',
			LOG_PRETTY: 'false'
		})

		const mensagens = jsonLines(stdout + stderr).map(e => e.msg)
		expect(mensagens).toEqual(['nivel-info', 'nivel-warn', 'nivel-error'])
	})

	it('LOG_PRETTY=true escreve linha legível em vez de JSON', async () => {
		const { stdout } = await runWithEnv(
			`
			const { logger } = await import('src/helpers/_logger.helper')
			logger.info('servidor iniciado', { port: 3000 })
			`,
			{ LOG_LEVEL: 'debug', LOG_PRETTY: 'true' }
		)

		const linha = stdout.trim().split('\n').at(-1)
		expect(linha).toContain('INFO')
		expect(linha).toContain('servidor iniciado')
		expect(linha).toContain('port=3000')
		expect(() => JSON.parse(linha)).toThrow()
	})

	it('modo pretty imprime o stack abaixo da linha do evento', async () => {
		const { stderr } = await runWithEnv(
			`
			const { logger } = await import('src/helpers/_logger.helper')
			logger.error('quebrou', { err: new Error('boom') })
			`,
			{ LOG_LEVEL: 'debug', LOG_PRETTY: 'true' }
		)

		expect(stderr).toContain('ERROR')
		expect(stderr).toContain('quebrou')
		expect(stderr).toContain('Error: boom')
	})
})
