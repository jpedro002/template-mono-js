import { setAttributes } from '@elysiajs/opentelemetry'
import { Elysia } from 'elysia'
import { metrics } from 'src/helpers/_metrics.helper'

// Mesma exclusão do log de acesso: documentação não é tráfego de API e só
// distorceria latência e contagem.
const IGNORED_PATHS = ['/docs']

function shouldMeasure(path) {
	return !IGNORED_PATHS.some(ignored => path.startsWith(ignored))
}

function tamanhoDoCorpo(headers) {
	const declarado = Number(headers?.['content-length'] ?? 0)
	return Number.isFinite(declarado) ? declarado : 0
}

/**
 * Métricas de HTTP.
 *
 * Plugin separado do `loggerPlugin` apesar de os dois medirem duração: log e
 * métrica têm destinos, retenções e unidades diferentes (ms no log, segundos na
 * métrica), e juntá-los faria um depender do outro para existir.
 *
 * Duas particularidades do ciclo de vida da Elysia moldam este arquivo:
 *
 * 1. **O `derive` não roda em requisição que não casou rota** — a Elysia levanta
 *    NOT_FOUND antes. Por isso o `onAfterResponse` confere se houve início
 *    cronometrado antes de decrementar as requisições em voo: decrementar sem ter
 *    incrementado deixaria o contador negativo e permanentemente errado. E 404
 *    sem rota não entra na latência, só na contagem de erro.
 * 2. **O `onError` roda antes do `errorHandler`**, que é quem decide o status
 *    final (`set.status = statusCode`). Ler o status dentro do `onError` daria
 *    200 num 404 — foi o que aconteceu na primeira versão. Então o `onError` só
 *    anota o *tipo* do erro no contexto e quem conta é o `onAfterResponse`, onde
 *    o status já é o que foi para o cliente.
 */
export const metricsPlugin = new Elysia({ name: 'metrics' })
	.derive({ as: 'global' }, ({ path }) => {
		if (!shouldMeasure(path)) return {}
		metrics.http.iniciou()
		return { metricsStartedAt: performance.now() }
	})
	.onError({ as: 'global' }, ctx => {
		// `code` da Elysia é fechado (NOT_FOUND, VALIDATION, PARSE, …) e o fallback
		// é o nome da classe do erro — nunca a mensagem, que é texto livre e viraria
		// uma série temporal por variação de texto.
		ctx.metricsErrorType = ctx.code || ctx.error?.name || 'unknown'
	})
	.onAfterResponse({ as: 'global' }, ctx => {
		const { request, path, route, set, headers, metricsStartedAt } = ctx
		if (!shouldMeasure(path)) return

		const status = typeof set.status === 'number' ? set.status : 200

		if (status >= 400) {
			metrics.http.erro({
				method: request.method,
				route,
				status,
				errorType: ctx.metricsErrorType
			})
		}

		if (!metricsStartedAt) return

		metrics.http.terminou({
			method: request.method,
			route,
			status,
			durationSeconds: (performance.now() - metricsStartedAt) / 1000,
			bodySize: tamanhoDoCorpo(headers)
		})

		// No trace, ao contrário da métrica, identificar a requisição é o ponto: é o
		// que permite sair de uma linha de log (que carrega o mesmo `reqId`) e achar
		// o waterfall correspondente. O span raiz só é encerrado no fim do
		// `afterResponse`, então ainda dá tempo de anotar.
		setAttributes({
			'app.request.id': ctx.reqId,
			...(ctx.user?.id && { 'user.id': ctx.user.id })
		})
	})

export default metricsPlugin
