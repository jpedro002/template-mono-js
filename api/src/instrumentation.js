/**
 * Fiação do OpenTelemetry — traces **e** métricas, um SDK só.
 *
 * Este arquivo é **preload**, não um import qualquer:
 *
 *   bun --preload ./src/instrumentation.js src/index.js
 *
 * A ordem é uma restrição, não uma preferência. A instrumentação do `pg`
 * funciona trocando os métodos do módulo no momento em que ele é carregado; se
 * `pg` já tiver sido importado — e ele é, pelo `@prisma/adapter-pg`, que o
 * `_prisma.service` carrega no topo — não há mais o que trocar, e as consultas
 * simplesmente não aparecem no trace, sem erro nenhum para denunciar.
 *
 * O `createApp()` importa o `otelPlugin` daqui. Preload e import resolvem para o
 * mesmo caminho, portanto para o mesmo módulo: um SDK por processo. **Não** crie
 * o SDK em outro arquivo — dois `NodeSDK` no mesmo processo dão dois pipelines e
 * atributos duplicados.
 *
 * Dois destinos, sem collector no meio (mesma escolha do log: sem agente):
 *
 * - **traces → Tempo**, OTLP/HTTP em `/v1/traces`.
 * - **métricas → VictoriaMetrics**, que ingere OTLP em `/opentelemetry/v1/metrics`,
 *   em outra porta. É o mesmo banco de séries que o Grafana lê como Prometheus.
 *
 * O exportador de métrica é **push**, não um `/metrics` para alguém raspar. Não é
 * gosto: em produção a API fica na rede do Dokploy e o backend de observabilidade
 * fora dela; no modelo pull o backend precisaria alcançar a API, no push quem abre
 * a conexão é a API, por uma rede privada só dela com o backend.
 *
 * Falha de exportação nunca chega ao cliente nem ao terminal: o lote é descartado
 * e a requisição segue (ver `OTEL_DIAG` para investigar o pipeline).
 */

import { hostname } from 'node:os'
import { opentelemetry } from '@elysiajs/opentelemetry'
import { DiagLogLevel, diag } from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import {
	BatchSpanProcessor,
	ParentBasedSampler,
	TraceIdRatioBasedSampler
} from '@opentelemetry/sdk-trace-node'
import { Elysia } from 'elysia'
import { settings } from 'src/config'
import { logger } from 'src/helpers/_logger.helper'
import { iniciarMetricas } from 'src/helpers/_metrics.helper'
import { createRedactingSpanProcessor } from 'src/helpers/_otel-redaction.helper'

function ligarDiagnostico() {
	const log = logger.child({ src: 'otel' })
	diag.setLogger(
		{
			error: (msg, ...args) => log.error(msg, { args }),
			warn: (msg, ...args) => log.warn(msg, { args }),
			info: (msg, ...args) => log.info(msg, { args }),
			debug: (msg, ...args) => log.debug(msg, { args }),
			verbose: (msg, ...args) => log.debug(msg, { args })
		},
		DiagLogLevel.INFO
	)
}

function criarPlugin() {
	if (!settings.OTEL_ENABLED) {
		// Instância nomeada e vazia: o `createApp()` não precisa saber se o OTel
		// está ligado, e a Elysia deduplica plugin por nome.
		return new Elysia({ name: 'otel-desligado' })
	}

	// Diagnóstico do próprio OTel. Desligado por padrão, mesma escolha do
	// `ship-logs.js`: coletor fora do ar não polui o terminal e não derruba
	// requisição. Ligue quando o suspeito é o pipeline.
	if (settings.OTEL_DIAG) ligarDiagnostico()

	return opentelemetry({
		serviceName: settings.OTEL_SERVICE_NAME,

		// Detecção automática de recurso **desligada**, e o conjunto de atributos
		// escrito à mão. Não é preciosismo: ligada, ela anexa `process.pid`,
		// `process.command_args`, `process.executable.path` e afins — e todo atributo
		// de recurso virá rótulo em *toda* métrica. `process.pid` muda a cada
		// reinício, então cada deploy criaria um conjunto novo de séries temporais
		// para as mesmas métricas, e `command_args` colocaria a linha de comando
		// inteira em cada série. Trace não sofre com isso (span não é série), mas o
		// recurso é o mesmo para os dois, e quem paga é o banco de métricas.
		autoDetectResources: false,
		resource: resourceFromAttributes({
			'service.version': process.env.npm_package_version || '1.0.0',
			'deployment.environment.name': settings.NODE_ENV,
			// Estável entre reinícios, ao contrário do pid — e é o que distingue duas
			// instâncias da API atrás do proxy.
			'host.name': hostname()
		}),

		// `ParentBased` respeita a decisão de quem chamou; sem isso um trace
		// iniciado no front-end seria cortado ao chegar aqui. A razão vale só para a
		// raiz.
		sampler: new ParentBasedSampler({
			root: new TraceIdRatioBasedSampler(settings.OTEL_TRACES_SAMPLER_ARG)
		}),

		// A ordem desta lista é de segurança, não de estilo: o `onEnd` roda na
		// ordem de registro, então a redação precisa vir antes de quem exporta.
		// Invertido, o span sai na rede com cookie e senha (ver
		// `_otel-redaction.helper`).
		spanProcessors: [
			createRedactingSpanProcessor(),
			new BatchSpanProcessor(
				new OTLPTraceExporter({
					url: settings.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
				})
			)
		],

		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({
				url: settings.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
			}),
			exportIntervalMillis: settings.OTEL_METRIC_EXPORT_INTERVAL
		}),

		instrumentations: [
			new PgInstrumentation({
				// `enhancedDatabaseReporting` anexaria os **valores** dos parâmetros ao
				// span. O texto do SQL já vai em `db.statement`; os valores são o corpo
				// da requisição do cliente (hash de senha, CPF, o que o domínio tiver).
				// Fica desligado.
				enhancedDatabaseReporting: false,
				// Comentário SQL com o trace id ajudaria no `pg_stat_statements`, mas
				// muda o texto da query — e o Postgres cacheia statement preparado por
				// texto.
				addSqlCommenterCommentToQueries: false
			})
		],

		// Documentação gera trace sem sinal — mesma exclusão do log de acesso.
		checkIfShouldTrace: request =>
			!new URL(request.url).pathname.startsWith('/docs')
	})
}

export const otelPlugin = criarPlugin()

// **Depois** de `criarPlugin()`, nunca antes: é ele quem chama `sdk.start()`, e
// só a partir daí existe um MeterProvider global. Instrumento criado antes disso
// nasce no-op e permanece no-op — foi exatamente o bug em que só as métricas do
// próprio SDK apareciam no VictoriaMetrics.
if (settings.OTEL_ENABLED) iniciarMetricas()

export default otelPlugin
