import { settings } from 'src/config'
import { logger } from 'src/helpers/_logger.helper'

/**
 * Uso do sistema, lido da telemetria.
 *
 * É consulta de métrica, e não link para o Grafana, por um motivo de acesso:
 * em produção o Grafana só é alcançável por túnel SSH, porque a mesma interface
 * lê o VictoriaLogs — onde mora a trilha de auditoria, com o corpo das
 * mutações. Publicar o link seria publicar a trilha.
 *
 * O que **pode** ser publicado é a métrica, por uma regra que o
 * `_metrics.helper` já impõe: *métrica não é log*. Nenhum atributo identifica
 * quem fez — `http.route` é o padrão da rota registrada no roteador, nunca a URL
 * concreta, e não existe `userId` nem nome de arquivo em série nenhuma.
 *
 * **Nada aqui inventa número.** Sem `METRICS_QUERY_URL`, com o SDK desligado ou
 * com o backend fora do ar, a rota responde 503 dizendo o que falta.
 */

// Consulta fixa, escrita aqui. O cliente escolhe a janela e nada mais — aceitar
// PromQL do browser seria dar leitura arbitrária ao banco de séries, incluindo
// as métricas do próprio processo.
const JANELAS = {
	'1h': { passo: '1m', pontos: 60 },
	'24h': { passo: '15m', pontos: 96 },
	'7d': { passo: '1h', pontos: 168 },
	'30d': { passo: '6h', pontos: 120 }
}

const SEGUNDOS = { '1h': 3600, '24h': 86_400, '7d': 604_800, '30d': 2_592_000 }

const TOPO = 15

function erro(mensagem, statusCode = 503) {
	const e = new Error(mensagem)
	e.statusCode = statusCode
	return e
}

/**
 * Uma consulta ao VictoriaMetrics pela API do Prometheus.
 *
 * Teto de tempo obrigatório, mesma regra do cache e do e-mail: backend de
 * métrica lento não pode pendurar a requisição de quem só queria ver um gráfico.
 */
async function consultar(caminho, params) {
	const url = new URL(`${settings.METRICS_QUERY_URL}/api/v1/${caminho}`)
	for (const [chave, valor] of Object.entries(params)) {
		url.searchParams.set(chave, String(valor))
	}

	const resposta = await fetch(url, {
		signal: AbortSignal.timeout(settings.METRICS_QUERY_TIMEOUT)
	})

	if (!resposta.ok) {
		throw erro(
			`O banco de métricas respondeu ${resposta.status}. Confira METRICS_QUERY_URL.`
		)
	}

	const corpo = await resposta.json()
	if (corpo.status !== 'success') {
		throw erro('O banco de métricas recusou a consulta.')
	}

	return corpo.data?.result ?? []
}

/** Valor escalar de uma consulta instantânea; `null` quando não há série. */
function escalar(resultado) {
	const valor = resultado[0]?.value?.[1]
	if (valor === undefined) return null
	const numero = Number(valor)
	return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null
}

function telemetriaController() {
	/**
	 * Requisições, erros, latência e login na janela pedida — mais a série no
	 * tempo e o pódio de rotas.
	 *
	 * `http.route` vira `http_route` e a métrica ganha sufixo `_total`/`_count`
	 * porque o VictoriaMetrics sobe com `-opentelemetry.usePrometheusNaming`. A
	 * mesma flag de que o dashboard versionado depende; sem ela nenhuma query
	 * casa, aqui ou lá.
	 */
	async function uso(ctx) {
		if (!settings.METRICS_QUERY_URL) {
			throw erro(
				'METRICS_QUERY_URL não está configurado — a tela de uso do sistema lê o VictoriaMetrics.'
			)
		}

		const janela = ctx.query.janela ?? '24h'
		const { passo } = JANELAS[janela]
		const servico = settings.OTEL_SERVICE_NAME
		const filtro = `service_name="${servico}"`
		const fim = Math.floor(Date.now() / 1000)
		const inicio = fim - SEGUNDOS[janela]

		const total = `sum(increase(http_server_request_duration_seconds_count{${filtro}}[${janela}]))`

		try {
			const [
				requisicoes,
				erros,
				p95,
				logins,
				porRota,
				porStatus,
				serie,
				rotasLentas
			] = await Promise.all([
				consultar('query', { query: total }),
				consultar('query', {
					query: `sum(increase(app_http_errors_total{${filtro}}[${janela}]))`
				}),
				consultar('query', {
					query: `histogram_quantile(0.95, sum by (le) (increase(http_server_request_duration_seconds_bucket{${filtro}}[${janela}])))`
				}),
				consultar('query', {
					query: `sum by (result) (increase(app_auth_login_total{${filtro}}[${janela}]))`
				}),
				consultar('query', {
					query: `topk(${TOPO}, sum by (http_route) (increase(http_server_request_duration_seconds_count{${filtro}}[${janela}])))`
				}),
				consultar('query', {
					query: `sum by (http_response_status_code) (increase(http_server_request_duration_seconds_count{${filtro}}[${janela}]))`
				}),
				consultar('query_range', {
					query: `sum(increase(http_server_request_duration_seconds_count{${filtro}}[${passo}]))`,
					start: inicio,
					end: fim,
					step: passo
				}),
				consultar('query', {
					query: `topk(${TOPO}, histogram_quantile(0.95, sum by (le, http_route) (increase(http_server_request_duration_seconds_bucket{${filtro}}[${janela}]))))`
				})
			])

			const requisicoesTotal = escalar(requisicoes) ?? 0
			const errosTotal = escalar(erros) ?? 0

			return {
				janela,
				servico,
				resumo: {
					requisicoes: requisicoesTotal,
					erros: errosTotal,
					// Ponto percentual, não fração: é o que a tela imprime.
					taxa_erro:
						requisicoesTotal === 0
							? null
							: Math.round((errosTotal / requisicoesTotal) * 10000) / 100,
					latencia_p95_segundos: escalar(p95),
					logins: Object.fromEntries(
						logins.map(l => [
							l.metric?.result ?? 'desconhecido',
							Math.round(Number(l.value[1]))
						])
					)
				},
				// `unrouted` é requisição que não casou rota nenhuma — scanner, link
				// velho, erro de digitação. Fica visível de propósito.
				rotas: porRota
					.map(r => ({
						rota: r.metric?.http_route ?? 'unrouted',
						requisicoes: Math.round(Number(r.value[1]))
					}))
					.sort((a, b) => b.requisicoes - a.requisicoes),
				rotas_lentas: rotasLentas
					.map(r => ({
						rota: r.metric?.http_route ?? 'unrouted',
						p95_segundos: Math.round(Number(r.value[1]) * 1000) / 1000
					}))
					.filter(r => Number.isFinite(r.p95_segundos))
					.sort((a, b) => b.p95_segundos - a.p95_segundos),
				status: porStatus
					.map(s => ({
						status: Number(s.metric?.http_response_status_code ?? 0),
						requisicoes: Math.round(Number(s.value[1]))
					}))
					.sort((a, b) => a.status - b.status),
				serie: (serie[0]?.values ?? []).map(([t, v]) => ({
					t: new Date(t * 1000).toISOString(),
					requisicoes: Math.round(Number(v))
				}))
			}
		} catch (err) {
			// Timeout e recusa de conexão do `fetch` chegam como TypeError/DOMException
			// sem `statusCode`: viram o mesmo 503 explicado, não um 500 anônimo.
			if (err.statusCode) throw err
			logger.error('falha ao consultar o banco de métricas', {
				err,
				url: settings.METRICS_QUERY_URL
			})
			throw erro(
				`Não foi possível falar com o banco de métricas em ${settings.METRICS_QUERY_URL}.`
			)
		}
	}

	return { uso }
}

export { JANELAS, telemetriaController }
