import { metrics as otelMetrics } from '@opentelemetry/api'
import { settings } from 'src/config'

/**
 * Registro central das métricas.
 *
 * Só a API `@opentelemetry/api` entra aqui — nada de SDK. Quem liga o SDK é o
 * `src/instrumentation.js`, e é ele quem chama `iniciarMetricas()`.
 *
 * **Por que a inicialização é explícita e não acontece no import.** Diferente do
 * tracer, o medidor do OTel **não** é um proxy: `metrics.getMeter()` chamado
 * antes de existir um `MeterProvider` global devolve um medidor no-op, e o
 * instrumento criado a partir dele permanece no-op para sempre — inclusive depois
 * de o SDK subir. Como o logger importa este módulo, criar os instrumentos no
 * topo do arquivo os condenava a nascer mortos: a exportação funcionava, mas só
 * as métricas do próprio SDK chegavam ao backend. Daí a ordem virar contrato:
 * `sdk.start()` primeiro, `iniciarMetricas()` depois.
 *
 * Antes de inicializar (e nos testes, onde o SDK está desligado) cada função da
 * fachada é uma saída antecipada. É o que permite instrumentar o código de
 * domínio sem `if (habilitado)` espalhado e sem coletor em teste.
 *
 * Duas regras que não se negociam:
 *
 * 1. **Atributo é sempre de cardinalidade fechada.** Cada combinação de
 *    atributos é uma série temporal no backend. `http.route` usa o padrão da
 *    rota (`/api/seguranca/users/:id`), nunca o caminho concreto — id de usuário
 *    como atributo é uma série por usuário, e é assim que se derruba um banco de
 *    métricas. Mesmo motivo para não haver `userId`, `cpf` ou nome de arquivo em
 *    atributo nenhum.
 * 2. **Métrica não é log.** Nada aqui identifica *quem* fez; para isso existe a
 *    trilha de auditoria no log, com retenção e controle de acesso próprios.
 *
 * Unidade de tempo é **segundo** (`s`), como manda a convenção do OTel — não
 * milissegundo. O log usa ms; os dois convivem, mas não se misturam.
 */

// Buckets explícitos: o default do SDK (0, 5, 10, 25, 50, 75, 100, 250, …) é
// pensado para milissegundos e jogaria quase toda requisição no primeiro bucket
// quando a unidade é segundo, tornando o p95 inútil.
const BUCKETS_SEGUNDOS = [
	0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10
]

// Faixa de duração de sessão: minutos a um dia. Nada a ver com latência.
const BUCKETS_SESSAO = [60, 300, 900, 1800, 3600, 7200, 14_400, 28_800, 86_400]

// Geração por LLM: segundos a mais de um minuto. Os buckets de latência HTTP
// terminam em 10 s e jogariam toda geração no último — um relatório de treze
// seções leva bem mais que isso, e é justamente a cauda que interessa medir.

/** Instrumentos. `null` enquanto `iniciarMetricas()` não rodou. */
let I = null

const INTERVALO_LAG_MS = 1000
let eventLoopLagSegundos = 0

/**
 * Atraso do event loop.
 *
 * Só existe por amostragem: não há como perguntar "qual o lag agora?". O
 * intervalo agenda para 1 s e mede o quanto passou disso — o excedente é o tempo
 * que o loop ficou preso em trabalho síncrono. É a métrica que distingue "o banco
 * está lento" de "o processo está afogado".
 */
function iniciarAmostragemDeLag() {
	let ultimo = performance.now()
	const timer = setInterval(() => {
		const agora = performance.now()
		eventLoopLagSegundos = Math.max(0, agora - ultimo - INTERVALO_LAG_MS) / 1000
		ultimo = agora
	}, INTERVALO_LAG_MS)
	// Sem unref o processo não fecha sozinho — nem em script, nem em teste.
	timer.unref?.()
	return timer
}

/**
 * `poolStats` é injetado pelo `_prisma.service`, o único lugar com referência ao
 * pool. Vive fora de `I` porque é registrado no import do serviço, antes de
 * qualquer inicialização de métrica.
 */
let poolStats = null

/** @param {(() => {total: number, idle: number, waiting: number, max: number}) | null} fn */
function registrarPoolDoBanco(fn) {
	poolStats = fn
}

/**
 * Callback das métricas observáveis (o SDK chama a cada intervalo de export).
 *
 * Recebe os instrumentos por parâmetro em vez de fechar sobre `I` para poder ser
 * exercitado com instrumentos falsos: com o SDK desligado o medidor no-op devolve
 * o *mesmo* objeto para todo `createObservableGauge`, e sem separar por
 * identidade não há como afirmar qual série recebeu qual valor.
 */
function coletarRuntime(result, instrumentos) {
	const memoria = process.memoryUsage()
	const cpu = process.cpuUsage()

	result.observe(instrumentos.uptime, process.uptime())
	result.observe(instrumentos.memoria, memoria.rss, { type: 'rss' })
	result.observe(instrumentos.memoria, memoria.heapUsed, { type: 'heap_used' })
	result.observe(instrumentos.memoria, memoria.heapTotal, {
		type: 'heap_total'
	})
	result.observe(instrumentos.memoria, memoria.external, { type: 'external' })
	// process.cpuUsage() vem em microssegundos; a convenção pede segundos.
	result.observe(instrumentos.cpu, cpu.user / 1e6, { mode: 'user' })
	result.observe(instrumentos.cpu, cpu.system / 1e6, { mode: 'system' })
	result.observe(instrumentos.eventLoopLag, eventLoopLagSegundos)

	const pool = poolStats?.()
	if (pool) {
		result.observe(instrumentos.dbConexoes, pool.total - pool.idle, {
			state: 'used'
		})
		result.observe(instrumentos.dbConexoes, pool.idle, { state: 'idle' })
		result.observe(instrumentos.dbFila, pool.waiting)
		// O teto do pool vira série própria para o painel desenhar saturação
		// (`used / max`) sem ninguém precisar lembrar de cor qual é o limite.
		result.observe(instrumentos.dbConexoesMax, pool.max)
	}
}

/**
 * Cria os instrumentos e liga a coleta. Idempotente.
 *
 * Chamada pelo `src/instrumentation.js` **depois** do `sdk.start()` — ver o
 * cabeçalho deste arquivo para o motivo.
 */
export function iniciarMetricas() {
	if (I) return I

	const meter = otelMetrics.getMeter(settings.OTEL_SERVICE_NAME, '1.0.0')

	const observaveis = {
		uptime: meter.createObservableGauge('process.uptime', {
			description: 'Tempo de vida do processo',
			unit: 's'
		}),
		memoria: meter.createObservableGauge('process.memory.usage', {
			description: 'Memória do processo por tipo',
			unit: 'By'
		}),
		cpu: meter.createObservableCounter('process.cpu.time', {
			description: 'Tempo de CPU consumido pelo processo',
			unit: 's'
		}),
		eventLoopLag: meter.createObservableGauge('app.runtime.eventloop.lag', {
			description: 'Atraso do event loop medido por amostragem de 1 s',
			unit: 's'
		}),
		// Nome próprio (`app.db.pool.*`) porque a instrumentação do `pg` já emite
		// `db.client.connection.*` a partir das conexões que ela enxerga — que não
		// são o `pg.Pool` do adapter do Prisma. Reaproveitar o nome somaria duas
		// contagens diferentes na mesma série.
		dbConexoes: meter.createObservableGauge('app.db.pool.connections', {
			description: 'Conexões do pool do Prisma por estado',
			unit: '{connection}'
		}),
		dbFila: meter.createObservableGauge('app.db.pool.pending', {
			description: 'Consultas esperando por conexão livre no pool',
			unit: '{request}'
		}),
		dbConexoesMax: meter.createObservableGauge('app.db.pool.max', {
			description: 'Teto de conexões configurado no pool',
			unit: '{connection}'
		})
	}

	I = {
		observaveis,

		httpDuration: meter.createHistogram('http.server.request.duration', {
			description: 'Duração da requisição HTTP',
			unit: 's',
			advice: { explicitBucketBoundaries: BUCKETS_SEGUNDOS }
		}),
		httpActive: meter.createUpDownCounter('http.server.active_requests', {
			description: 'Requisições em voo',
			unit: '{request}'
		}),
		httpBodySize: meter.createHistogram('http.server.request.body.size', {
			description: 'Tamanho do corpo declarado pelo cliente (content-length)',
			unit: 'By'
		}),
		httpErrors: meter.createCounter('app.http.errors', {
			description:
				'Respostas de erro por tipo, inclusive as que não casaram rota',
			unit: '{error}'
		}),
		// Mesmo raciocínio do pool: `db.client.operation.duration` é da
		// instrumentação do `pg` e mede o SQL. Este mede a operação do Prisma ponta
		// a ponta — inclui espera por conexão, `parseValues` e `adjustTimezone`.
		dbDuration: meter.createHistogram('app.db.operation.duration', {
			description: 'Duração da operação do Prisma, ponta a ponta',
			unit: 's',
			advice: { explicitBucketBoundaries: BUCKETS_SEGUNDOS }
		}),
		authLogin: meter.createCounter('app.auth.login', {
			description: 'Tentativas de login por resultado',
			unit: '{attempt}'
		}),
		authLogout: meter.createCounter('app.auth.logout', {
			description: 'Logouts efetivados',
			unit: '{logout}'
		}),
		authSessionDuration: meter.createHistogram('app.auth.session.duration', {
			description: 'Duração da sessão fechada por logout explícito',
			unit: 's',
			advice: { explicitBucketBoundaries: BUCKETS_SESSAO }
		}),
		authzDecision: meter.createCounter('app.authz.decision', {
			description: 'Decisões do RBAC (permite/nega) por tipo de checagem',
			unit: '{decision}'
		}),
		authzCache: meter.createCounter('app.authz.cache', {
			description: 'Acertos e faltas no cache de permissões',
			unit: '{lookup}'
		}),
		rateLimitBlocked: meter.createCounter('app.ratelimit.blocked', {
			description: 'Requisições recusadas pelo rate limit',
			unit: '{request}'
		}),
		storageOperation: meter.createCounter('app.storage.operation', {
			description: 'Operações do kit de storage por perfil e resultado',
			unit: '{operation}'
		}),
		storageBytes: meter.createCounter('app.storage.bytes', {
			description: 'Bytes que passaram pelo storage',
			unit: 'By'
		}),
		cacheOperation: meter.createCounter('app.cache.operation', {
			description:
				'Operações do cache por namespace e resultado (hit/miss/ok/error)',
			unit: '{operation}'
		}),
		mailSend: meter.createCounter('app.mail.send', {
			description: 'E-mails transacionais por template e resultado',
			unit: '{mail}'
		}),
		logEvents: meter.createCounter('app.log.events', {
			description: 'Eventos de log por nível',
			unit: '{event}'
		})
	}

	meter.addBatchObservableCallback(
		result => coletarRuntime(result, observaveis),
		Object.values(observaveis)
	)

	// Uma vez só: a guarda `if (I)` no topo já impede segunda passagem por aqui.
	iniciarAmostragemDeLag()

	return I
}

/**
 * Fachada das métricas. Cada função é um ponto de instrumentação nomeado — o
 * código de domínio nunca toca em instrumento nem em nome de métrica.
 */
export const metrics = {
	http: {
		iniciou: () => I?.httpActive.add(1),
		terminou: ({ method, route, status, durationSeconds, bodySize }) => {
			if (!I) return
			I.httpActive.add(-1)
			const atributos = {
				'http.request.method': method,
				// Padrão da rota, nunca o caminho concreto. Requisição que não casou
				// com rota nenhuma não tem padrão — e usar o caminho aqui abriria uma
				// série nova para cada URL que um scanner tentasse.
				'http.route': route || 'unrouted',
				'http.response.status_code': status
			}
			I.httpDuration.record(durationSeconds, atributos)
			if (bodySize > 0) I.httpBodySize.record(bodySize, atributos)
		},
		// Contador separado do histograma porque cobre um caso que o histograma não
		// cobre: requisição que não casou rota morre antes do `derive`, então não tem
		// início cronometrado e não pode entrar na latência. Sem este contador, um
		// scanner batendo em 404 ficaria invisível na métrica.
		erro: ({ method, route, status, errorType }) => {
			I?.httpErrors.add(1, {
				'http.request.method': method,
				'http.route': route || 'unrouted',
				'http.response.status_code': status,
				'error.type': errorType || 'unknown'
			})
		}
	},

	db: {
		operacao: ({ model, operation, durationSeconds, errorType }) => {
			I?.dbDuration.record(durationSeconds, {
				'db.collection.name': model || 'raw',
				'db.operation.name': operation || 'unknown',
				...(errorType && { 'error.type': errorType })
			})
		},
		registrarPool: registrarPoolDoBanco
	},

	auth: {
		// `result` é fechado em 'success' | 'invalid_credentials': nada de mensagem
		// de erro como atributo.
		login: result => I?.authLogin.add(1, { result }),
		logout: () => I?.authLogout.add(1),
		sessaoFechada: segundos => I?.authSessionDuration.record(segundos)
	},

	authz: {
		decisao: (kind, result) => I?.authzDecision.add(1, { kind, result }),
		cache: result => I?.authzCache.add(1, { result })
	},

	rateLimit: {
		bloqueado: bucket => I?.rateLimitBlocked.add(1, { bucket })
	},

	storage: {
		operacao: ({ operation, profile, result }) =>
			I?.storageOperation.add(1, { operation, profile, result }),
		bytes: ({ operation, profile, bytes }) => {
			if (bytes > 0) I?.storageBytes.add(bytes, { operation, profile })
		}
	},

	// `namespace` é atributo de cardinalidade fechada: são os nomes declarados no
	// código, nunca a chave da entrada (uma série por combinação de filtro é o
	// caminho conhecido para derrubar o banco de séries).
	cache: {
		operacao: ({ operation, namespace, result }) =>
			I?.cacheOperation.add(1, { operation, namespace, result })
	},

	// `template` é o nome declarado no código, nunca o destinatário: endereço em
	// métrica é uma série por usuário.
	mail: {
		envio: ({ template, driver, result }) =>
			I?.mailSend.add(1, { template, driver, result })
	},

	log: {
		evento: level => I?.logEvents.add(1, { level })
	},

	// exportados para teste
	_coletarRuntime: coletarRuntime,
	_iniciarAmostragemDeLag: iniciarAmostragemDeLag,
	_instrumentos: () => I
}

export default metrics
