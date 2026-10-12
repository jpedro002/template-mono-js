import { Elysia } from 'elysia'
import { logger } from 'src/helpers/_logger.helper'

// Documentação gera muito ruído e nenhum sinal — fica de fora do log de acesso.
const IGNORED_PATHS = ['/docs']

// Só mutação carrega corpo que interessa à auditoria: é o "quem alterou o quê".
const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Acima disso o corpo não entra na linha. O sistema antigo guardava payload de
// até 51 KB, o que inviabiliza um evento por linha; 4 KB cobria 99,6% dos
// registros dele.
const BODY_LIMIT = 4096

function shouldLog(path) {
	return !IGNORED_PATHS.some(ignored => path.startsWith(ignored))
}

function levelFor(status) {
	if (status >= 500) return 'error'
	if (status >= 400) return 'warn'
	return 'info'
}

// Arquivo enviado nunca vai para o log — sem isso o binário inteiro entra na
// linha. A redação de segredos não acontece aqui: quem faz é o `normalize` do
// logger, que já percorre o objeto todo.
function stripFiles(value) {
	if (value instanceof Blob) return '[FILE]'
	if (Array.isArray(value)) return value.map(stripFiles)
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, val]) => [key, stripFiles(val)])
		)
	}
	return value
}

function auditBody(method, body) {
	if (!AUDITED_METHODS.has(method) || !body || typeof body !== 'object') {
		return undefined
	}

	const clean = stripFiles(body)

	try {
		const size = JSON.stringify(clean)?.length ?? 0
		return size > BODY_LIMIT ? `[BODY omitido: ${size} bytes]` : clean
	} catch {
		// Corpo com referência circular ou valor não serializável.
		return '[BODY não serializável]'
	}
}

/**
 * Log de acesso estruturado.
 *
 * `derive` roda antes da validação, então o `reqId` existe mesmo em requisições
 * que falham no schema. Rotas inexistentes não passam por ele — nesses casos a
 * duração fica indisponível.
 */
export const loggerPlugin = new Elysia({ name: 'logger' })
	.derive({ as: 'global' }, ({ headers, set }) => {
		const reqId = headers['x-request-id'] || crypto.randomUUID().slice(0, 8)

		// Devolve o id ao cliente para correlacionar erro reportado com o log.
		set.headers['x-request-id'] = reqId

		return {
			reqId,
			startedAt: performance.now(),
			log: logger.child({ reqId })
		}
	})
	.onAfterResponse(
		{ as: 'global' },
		({ request, path, set, body, reqId, startedAt, user }) => {
			if (!shouldLog(path)) return

			const status = set.status ?? 200

			logger[levelFor(status)]('request', {
				reqId,
				method: request.method,
				path,
				status,
				durationMs: startedAt
					? Number((performance.now() - startedAt).toFixed(1))
					: undefined,
				userId: user?.id,
				body: auditBody(request.method, body)
			})
		}
	)

export default loggerPlugin
