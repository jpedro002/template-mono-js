const PORT = process.env.PORT || 3000
const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256'
const NODE_ENV = process.env.NODE_ENV || 'development'

// JWT_SECRET nunca deve cair em um valor padrão silencioso.
// Em produção, sem segredo definido a aplicação não deve subir.
if (!process.env.JWT_SECRET && NODE_ENV === 'production') {
	throw new Error(
		'JWT_SECRET é obrigatório em produção. Defina a variável de ambiente JWT_SECRET.'
	)
}

if (!process.env.JWT_SECRET) {
	console.warn(
		'[AVISO] JWT_SECRET não definido — usando segredo inseguro de desenvolvimento. Não use em produção.'
	)
}

const JWT_SECRET =
	process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'
// 5173 é a porta padrão do Vite — origem do `web` em desenvolvimento. Com
// cookie de sessão o allowlist tem que ser exato (`*` é recusado pelo browser
// quando a requisição manda credencial), então a origem precisa estar aqui.
const CORS_ORIGIN =
	process.env.CORS_ORIGIN ||
	'http://localhost:3000,http://localhost:3001,http://localhost:5173'

/**
 * Converte durações no formato do JWT ('24h', '7d', '30m', '3600') em segundos,
 * para uso no Max-Age do cookie.
 */
function toSeconds(duration) {
	const match = /^(\d+)\s*([smhd])?$/.exec(String(duration).trim())
	if (!match) return 86400
	const value = Number(match[1])
	const unit = match[2] || 's'
	return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit]
}

const COOKIE_NAME = process.env.COOKIE_NAME || 'access_token'
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || 'lax'
// Sem HTTPS o browser descarta o cookie Secure — por isso o default segue o ambiente.
const COOKIE_SECURE = process.env.COOKIE_SECURE
	? process.env.COOKIE_SECURE === 'true'
	: NODE_ENV === 'production'
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined
const COOKIE_MAX_AGE = toSeconds(JWT_EXPIRES_IN)

// SameSite=None manda o cookie em requisições cross-site: a proteção contra CSRF
// que o SameSite oferece deixa de existir e passa a exigir token anti-CSRF.
if (COOKIE_SAMESITE === 'none') {
	console.warn(
		'[AVISO] COOKIE_SAMESITE=none — a API fica exposta a CSRF sem proteção adicional (token anti-CSRF).'
	)
}

// Fora de produção o log sai legível e colorido; em produção, JSON por linha
// (formato que agregadores como Loki, Datadog e CloudWatch consomem direto).
const LOG_LEVEL =
	process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug')
const LOG_PRETTY = process.env.LOG_PRETTY
	? process.env.LOG_PRETTY === 'true'
	: NODE_ENV !== 'production'

// Storage compatível com S3 (AWS S3, Cloudflare R2, MinIO, Spaces, Backblaze).
// `memory` troca o driver por um Map em processo — só para teste e dev offline.
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 's3'
// Porta padrão explícita (`https://host:443`) sai daqui: o `presign` do Bun
// assina o `host` com a porta e o cliente manda sem — o MinIO responde
// `SignatureDoesNotMatch` e todo download por URL assinada quebra.
const semPortaPadrao = endpoint => {
	if (!endpoint) return undefined
	try {
		const url = new URL(endpoint)
		return url.port === '' && /:(443|80)(\/|$)/.test(endpoint)
			? endpoint.replace(/:(443|80)(?=\/|$)/, '')
			: endpoint
	} catch {
		return endpoint
	}
}
const S3_ENDPOINT = semPortaPadrao(process.env.S3_ENDPOINT || undefined)
const S3_REGION = process.env.S3_REGION || 'us-east-1'
const S3_BUCKET = process.env.S3_BUCKET || 'app-private'
const S3_PUBLIC_BUCKET = process.env.S3_PUBLIC_BUCKET || undefined
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || ''
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || ''
// MinIO responde em path-style (`host:9000/bucket/key`); AWS e R2, em
// virtual-hosted (`bucket.host/key`).
const S3_VIRTUAL_HOSTED = process.env.S3_VIRTUAL_HOSTED === 'true'
const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || '').replace(/\/+$/, '')

const STORAGE_MAX_SIZE = Number(process.env.STORAGE_MAX_SIZE || 25_000_000)
const STORAGE_PRESIGN_TTL = Number(process.env.STORAGE_PRESIGN_TTL || 300)
// Acima deste tamanho o arquivo não é lido inteiro em memória: o upload vira
// stream e sai sem checksum.
const STORAGE_CHECKSUM_LIMIT = Number(
	process.env.STORAGE_CHECKSUM_LIMIT || 8_000_000
)

// Cache de leitura. `memory` é um Map do processo (dev, teste e instância
// única); `redis` vale a pena quando há mais de uma instância servindo, senão
// cada uma aquece o próprio cache; `none` desliga sem mexer em código.
//
// Em teste o driver é sempre `memory`: driver com rede em teste unitário é
// dependência escondida, e `none` esconderia justamente o que se quer testar.
const CACHE_DRIVER =
	NODE_ENV === 'test' ? 'memory' : process.env.CACHE_DRIVER || 'memory'
const CACHE_TTL = Number(process.env.CACHE_TTL || 300)
// Estado da sessão (versão do token, ativo/excluído) conferido a cada
// requisição autenticada. Curto: é o atraso máximo de uma revogação nas outras
// instâncias quando o driver é `memory`. Com `redis` a revogação vale na hora.
const SESSAO_CACHE_TTL = Number(process.env.SESSAO_CACHE_TTL || 30)
// Prefixo de todas as chaves. O Redis pode não ser exclusivo desta API — é o
// prefixo que delimita o que a aplicação pode apagar.
const CACHE_PREFIX = process.env.CACHE_PREFIX || 'app:cache:'
// Só o driver de memória usa: teto de entradas antes de começar a descartar.
const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 5_000)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const REDIS_CONNECT_TIMEOUT = Number(process.env.REDIS_CONNECT_TIMEOUT || 3_000)
// Teto de cada operação de cache. Existe por medição: com o Redis fora do ar, o
// cliente só rejeita o comando quando estoura o timeout de conexão (~2,6 s
// observados) — sem este corte, uma queda do cache somaria segundos a **toda**
// requisição, que é o oposto do motivo de existir um cache.
const CACHE_TIMEOUT = Number(process.env.CACHE_TIMEOUT || 200)

if (CACHE_DRIVER === 'redis' && !process.env.REDIS_URL) {
	console.warn(
		'[AVISO] CACHE_DRIVER=redis sem REDIS_URL — usando redis://localhost:6379.'
	)
}

// E-mail transacional (registro, recuperação de senha, troca de e-mail).
// `ses` fala a API HTTP do SESv2 direto, sem SDK — a assinatura SigV4 é feita
// com Web Crypto no `_mail.service`. `log` só escreve a mensagem no stdout (dev
// sem credencial); `memory` guarda em array (teste).
//
// Em teste o driver é sempre `memory`: driver com rede em teste é dependência
// escondida, e o corpo do e-mail é exatamente o que os testes precisam ler.
const MAIL_DRIVER =
	NODE_ENV === 'test' ? 'memory' : process.env.MAIL_DRIVER || 'ses'
const MAIL_FROM = process.env.MAIL_FROM || 'nao-responda@app.local'
// Nome amigável do remetente. Vai como `Nome <endereco>`.
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'App'
// Base dos links que vão no corpo do e-mail — é o `web`, não a API.
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(
	/\/+$/,
	''
)
// Teto de tempo do envio. Sem ele, um SES lento vira um register pendurado: o
// e-mail é efeito colateral do cadastro, não o cadastro.
const MAIL_TIMEOUT = Number(process.env.MAIL_TIMEOUT || 8_000)

// Região e credenciais do SES. Separadas das de S3 de propósito: em produção o
// bucket pode estar no MinIO/R2 e o e-mail na AWS, com chaves diferentes — e a
// chave do SES só precisa de `ses:SendEmail`.
const AWS_REGION = process.env.AWS_REGION || S3_REGION
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || ''
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || ''
// Credencial temporária (role de task/instância) — ausente com chave estática.
const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || ''

// Sem credencial o SES recusa toda chamada — e o primeiro a descobrir seria um
// usuário tentando recuperar a senha.
if (
	MAIL_DRIVER === 'ses' &&
	!AWS_SESSION_TOKEN &&
	!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY)
) {
	console.warn(
		'[AVISO] MAIL_DRIVER=ses sem credencial da AWS — todo envio vai falhar. Use MAIL_DRIVER=log em desenvolvimento.'
	)
}

// Alternativa ao SES: `MAIL_DRIVER=resend`. Só um provedor por vez.
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''

if (MAIL_DRIVER === 'resend' && !RESEND_API_KEY) {
	console.warn(
		'[AVISO] MAIL_DRIVER=resend sem RESEND_API_KEY — todo envio vai falhar.'
	)
}

// Geração por LLM (onda 8: pontos de atenção, análise de plano, insight de
// painel, suporte, diagnóstico e plano estratégico).
//
// OpenTelemetry. Os nomes seguem as variáveis padrão da especificação (não são
// invenção deste projeto), então qualquer ferramenta OTel entende o mesmo env.
//
// Desligado nos testes: exportador em teste tenta rede e o SDK instala hooks de
// contexto no processo — nada disso ajuda a asserção e tudo isso deixa rastro
// entre arquivos de teste.
const OTEL_ENABLED =
	NODE_ENV !== 'test' && process.env.OTEL_SDK_DISABLED !== 'true'
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'api'

// Base OTLP/HTTP. O Tempo escuta em :4318 e monta os caminhos padrão
// (`/v1/traces`); o VictoriaMetrics ingere OTLP num caminho próprio
// (`/opentelemetry/v1/metrics`) e em outra porta, por isso métrica e trace têm
// endpoint separado em vez de derivarem os dois da mesma base.
const OTEL_EXPORTER_OTLP_ENDPOINT = (
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
).replace(/\/+$/, '')
const OTEL_EXPORTER_OTLP_TRACES_ENDPOINT =
	process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
	`${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
const OTEL_EXPORTER_OTLP_METRICS_ENDPOINT =
	process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
	'http://localhost:8428/opentelemetry/v1/metrics'

// Leitura das métricas de volta, para a tela de uso do sistema (onda 10). É o
// **mesmo** VictoriaMetrics para onde o SDK empurra, agora pela API de consulta
// do Prometheus (`/api/v1/query`), daí o default derivar da origem do endpoint
// de ingestão em vez de pedir um segundo endereço.
//
// Vazio desliga a tela: sem backend de métrica a rota responde 503 dizendo o que
// falta. Inventar número quando o coletor está fora do ar é pior que não ter a
// tela — e foi exatamente o defeito do `/admin/analytics` do sistema anterior,
// que mostrava um gráfico bonito sobre um array do `localStorage`.
//
// O fallback pela origem do endpoint de export só vale quando a API escreve
// direto no VictoriaMetrics (o caso do dev). Havendo collector no caminho, essa
// origem é a do collector, que não responde consulta nenhuma — por isso em
// produção o `METRICS_QUERY_URL` é explícito no compose.
const METRICS_QUERY_URL = (
	process.env.METRICS_QUERY_URL ||
	new URL(OTEL_EXPORTER_OTLP_METRICS_ENDPOINT).origin
).replace(/\/+$/, '')

const METRICS_QUERY_TIMEOUT = Number(process.env.METRICS_QUERY_TIMEOUT || 5000)

// Intervalo de push das métricas. Abaixo de ~10 s o custo de série temporal
// cresce sem ganho de resolução real para uma API deste porte.
const OTEL_METRIC_EXPORT_INTERVAL = Number(
	process.env.OTEL_METRIC_EXPORT_INTERVAL || 15_000
)

// Amostragem de trace **de cabeça**: 1 nos dois ambientes, ou seja, a API
// exporta todos os traces. O default já foi 0,1 em produção e isso era o
// defeito: a decisão acontece no primeiro span, antes de existir resultado,
// então 90% dos 5xx e das requisições lentas — justamente o que se quer olhar —
// eram sorteados fora. Quem protege o disco do Tempo agora é o `tail_sampling`
// do collector (`otel/collector.yml`), que decide com o trace já fechado.
// Baixar este número em produção reintroduz o defeito.
// `parentbased_*` respeita a decisão de quem chamou, para não cortar um trace
// no meio.
const OTEL_TRACES_SAMPLER_ARG = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? 1)

// Erro de exportação é silencioso por padrão — mesma escolha do `ship-logs.js`:
// coletor fora do ar não polui o terminal nem derruba a requisição. Ligue para
// diagnosticar o pipeline.
const OTEL_DIAG = process.env.OTEL_DIAG === 'true'

// A exigência das credenciais de storage mora no `_storage.service` e não aqui:
// quem não importa o storage (um teste de settings, um script) não deve deixar
// de subir por causa de uma variável de bucket.

// Sem URL pública a única forma de servir o bucket público é o endpoint interno
// — que em produção normalmente não é roteável pelo browser.
if (S3_PUBLIC_BUCKET && !S3_PUBLIC_URL) {
	console.warn(
		'[AVISO] S3_PUBLIC_BUCKET definido sem S3_PUBLIC_URL — as URLs públicas apontarão para o endpoint interno.'
	)
}

const settings = {
	PORT,
	JWT_ALGORITHM,
	JWT_SECRET,
	JWT_EXPIRES_IN,
	JWT_REFRESH_EXPIRES_IN,
	CORS_ORIGIN,

	COOKIE_NAME,
	COOKIE_SAMESITE,
	COOKIE_SECURE,
	COOKIE_DOMAIN,
	COOKIE_MAX_AGE,

	LOG_LEVEL,
	LOG_PRETTY,

	STORAGE_DRIVER,
	S3_ENDPOINT,
	S3_REGION,
	S3_BUCKET,
	S3_PUBLIC_BUCKET,
	S3_ACCESS_KEY_ID,
	S3_SECRET_ACCESS_KEY,
	S3_VIRTUAL_HOSTED,
	S3_PUBLIC_URL,
	STORAGE_MAX_SIZE,
	STORAGE_PRESIGN_TTL,
	STORAGE_CHECKSUM_LIMIT,

	CACHE_DRIVER,
	CACHE_TTL,
	SESSAO_CACHE_TTL,
	CACHE_PREFIX,
	CACHE_MAX_ENTRIES,
	REDIS_URL,
	REDIS_CONNECT_TIMEOUT,
	CACHE_TIMEOUT,

	MAIL_DRIVER,
	MAIL_FROM,
	MAIL_FROM_NAME,
	MAIL_TIMEOUT,
	RESEND_API_KEY,
	APP_URL,
	AWS_REGION,
	AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY,
	AWS_SESSION_TOKEN,

	OTEL_ENABLED,
	OTEL_SERVICE_NAME,
	OTEL_EXPORTER_OTLP_ENDPOINT,
	OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
	OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
	METRICS_QUERY_URL,
	METRICS_QUERY_TIMEOUT,
	OTEL_METRIC_EXPORT_INTERVAL,
	OTEL_TRACES_SAMPLER_ARG,
	OTEL_DIAG,

	NODE_ENV
}

export { settings }
