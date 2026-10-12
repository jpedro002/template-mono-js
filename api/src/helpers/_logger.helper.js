import { settings } from 'src/config'
import { metrics } from 'src/helpers/_metrics.helper'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

const threshold = LEVELS[settings.LOG_LEVEL] ?? LEVELS.info
const pretty = settings.LOG_PRETTY
const colored = pretty && Boolean(Bun.enableANSIColors)

const COLORS = {
	debug: '\x1b[90m',
	info: '\x1b[36m',
	warn: '\x1b[33m',
	error: '\x1b[31m',
	dim: '\x1b[90m',
	reset: '\x1b[0m'
}

// Radicais que marcam a chave como segredo. A comparação é por *substring* sobre
// a chave normalizada (minúscula, sem `_` e `-`), então um radical cobre todos os
// compostos: `password` pega `password_confirmation` e `currentPassword`, `senha`
// pega `senha_atual` e `nova_senha`, `cookie` pega `set-cookie`.
//
// Enumerar chave por chave era o furo: quando o corpo da requisição do cliente
// passou a ser logado, qualquer nome composto que ninguém previu vazava.
const SENSITIVE_PARTS = [
	'senha',
	'password',
	'passwd',
	'secret',
	'token',
	'apikey',
	'credential',
	'authorization',
	'cookie',
	'cvv',
	'cvc',
	'cardnumber',
	'creditcard'
]

// `cpf` fica de fora de propósito: é PII, não credencial, e redigir apagaria a
// própria informação que a trilha de auditoria existe para guardar. Se a LGPD
// pesar mais que a auditoria aqui, é só adicionar na lista acima.

const MAX_DEPTH = 3

/**
 * Uma chave é segredo? Exportada porque a redação de atributos de span
 * (`_otel-redaction.helper`) precisa da **mesma** lista de radicais: duas listas
 * em dois arquivos divergem, e a que ficar para trás vaza.
 * @param {string} key
 */
export function isSensitiveKey(key) {
	const normalized = key.toLowerCase().replace(/[_-]/g, '')
	return SENSITIVE_PARTS.some(part => normalized.includes(part))
}

/**
 * Remove segredos, achata quebras de linha e corta textos gigantes — garante
 * que um evento de log ocupe exatamente uma linha.
 */
function normalize(value, depth = 0) {
	if (typeof value === 'string') return compact(value)
	if (value === null || typeof value !== 'object') return value

	// O corte de profundidade existe para não percorrer objetos gigantes (ex: um
	// Prisma client inteiro). Devolver o valor cru aqui vazaria tudo que estivesse
	// abaixo do limite sem passar pela redação — por isso trunca.
	if (depth > MAX_DEPTH) return '[TRUNCATED]'

	if (Array.isArray(value)) return value.map(item => normalize(item, depth + 1))

	return Object.entries(value).reduce((acc, [key, val]) => {
		acc[key] = isSensitiveKey(key) ? '[REDACTED]' : normalize(val, depth + 1)
		return acc
	}, {})
}

// Erros de validação da Elysia carregam um JSON inteiro na mensagem; sem isso
// uma única linha de log vira dezenas.
function compact(message, limit = 300) {
	const text = String(message).replace(/\s+/g, ' ').trim()
	return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function serializeError(err) {
	if (!err) return undefined
	if (!(err instanceof Error)) return { message: compact(err) }

	return {
		type: err.name,
		message: compact(err.message),
		...(err.code && { code: err.code }),
		...(err.statusCode && { statusCode: err.statusCode }),
		stack: err.stack
	}
}

function formatPretty(level, msg, fields) {
	const time = new Date().toISOString().slice(11, 23)
	const { err, ...rest } = fields

	const pairs = Object.entries(rest)
		.filter(([, v]) => v !== undefined && v !== null)
		.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
		.join(' ')

	const head = colored
		? `${COLORS.dim}${time}${COLORS.reset} ${COLORS[level]}${level.toUpperCase().padEnd(5)}${COLORS.reset} ${msg}`
		: `${time} ${level.toUpperCase().padEnd(5)} ${msg}`

	const tail = pairs
		? colored
			? ` ${COLORS.dim}${pairs}${COLORS.reset}`
			: ` ${pairs}`
		: ''

	const stack = err?.stack ? `\n${err.stack}` : ''

	return `${head}${tail}${stack}`
}

function emit(level, msg, fields = {}) {
	if (LEVELS[level] < threshold) return

	// Conta o que de fato saiu (por isso depois do corte de nível): dá taxa de
	// erro em painel sem precisar consultar o banco de logs, que é mais caro e
	// tem outra retenção.
	metrics.log.evento(level)

	const { err, ...rest } = fields
	const payload = {
		...normalize(rest),
		...(err && { err: serializeError(err) })
	}

	const line = pretty
		? formatPretty(level, msg, payload)
		: JSON.stringify({
				level,
				time: new Date().toISOString(),
				msg,
				...payload
			})

	if (level === 'error') console.error(line)
	else console.log(line)
}

function build(base = {}) {
	const withBase = level => (msg, fields) =>
		emit(level, msg, { ...base, ...fields })

	return {
		debug: withBase('debug'),
		info: withBase('info'),
		warn: withBase('warn'),
		error: withBase('error'),
		/**
		 * Cria um logger que carrega campos fixos (ex: reqId) em toda chamada.
		 * @param {object} fields
		 */
		child: fields => build({ ...base, ...fields })
	}
}

export const logger = build()
export default logger
