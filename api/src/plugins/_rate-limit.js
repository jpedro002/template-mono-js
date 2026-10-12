import { status } from 'elysia'
import { metrics } from 'src/helpers/_metrics.helper'

/**
 * Rate limiter em memória (janela fixa por IP).
 *
 * Sem dependência externa e sem infraestrutura adicional — adequado para uma
 * única instância. Em deploy multi-instância cada processo mantém seu próprio
 * contador; para um limite global use um store compartilhado (ex: Redis).
 *
 * NOTA: usa o IP da conexão (`server.requestIP`). Atrás de proxy reverso o IP
 * será o do proxy — só use X-Forwarded-For se o proxy for confiável, caso
 * contrário o cliente pode forjar o header e burlar o limite.
 */
const buckets = new Map()

function chaveDe(ctx, keyPrefix, keyBy) {
	const id = keyBy
		? keyBy(ctx) || 'unknown'
		: ctx.server?.requestIP(ctx.request)?.address || 'unknown'
	return `${keyPrefix}:${id}`
}

function contagem(key) {
	const entry = buckets.get(key)
	if (!entry || Date.now() > entry.reset) return 0
	return entry.count
}

function bloqueio(keyPrefix) {
	// `keyPrefix` é fechado por construção (definido no código da rota) —
	// diferente da chave, que embute o IP e abriria uma série por cliente.
	metrics.rateLimit.bloqueado(keyPrefix)
	return status(429, {
		error: 'Too Many Requests',
		message: 'Limite de requisições excedido. Tente novamente mais tarde.',
		statusCode: 429
	})
}

function hit(key, max, windowMs) {
	const now = Date.now()
	const entry = buckets.get(key)
	if (!entry || now > entry.reset) {
		buckets.set(key, { count: 1, reset: now + windowMs })
		return { allowed: true, remaining: max - 1 }
	}
	entry.count += 1
	return {
		allowed: entry.count <= max,
		remaining: Math.max(0, max - entry.count)
	}
}

// Limpeza periódica dos buckets expirados
const cleanup = setInterval(() => {
	const now = Date.now()
	for (const [key, entry] of buckets) {
		if (now > entry.reset) buckets.delete(key)
	}
}, 60_000)
cleanup.unref?.()

/**
 * Cria um handler `beforeHandle` de rate limit.
 * @param {object} opts
 * @param {number} [opts.max=100] - Máximo de requisições por janela
 * @param {number} [opts.windowMs=60000] - Tamanho da janela em ms
 * @param {string} [opts.keyPrefix='global'] - Prefixo para separar limites
 * @param {(ctx: object) => string} [opts.keyBy] - Deriva a chave do contexto
 *   (ex: `({ user }) => user.id`). Precisa rodar depois do `authenticate`.
 *   Sem isso a chave é o IP — atrás de proxy, todo mundo divide o mesmo balde.
 */
export function rateLimit(opts = {}) {
	const { max = 100, windowMs = 60_000, keyPrefix = 'global', keyBy } = opts

	return ctx => {
		const { allowed, remaining } = hit(
			chaveDe(ctx, keyPrefix, keyBy),
			max,
			windowMs
		)

		ctx.set.headers['x-ratelimit-limit'] = String(max)
		ctx.set.headers['x-ratelimit-remaining'] = String(remaining)

		if (!allowed) return bloqueio(keyPrefix)
	}
}

/**
 * `beforeHandle` que **só lê** o balde — quem enche é `rateLimitHit`, chamado
 * depois de a rota saber se a tentativa falhou.
 *
 * Existe por causa do login: contando toda requisição, quatro ciclos de
 * login/logout esgotavam o limite de 5/min e o quinto login **com a senha
 * certa** levava 429 por até um minuto. O que o limite protege é a adivinhação
 * de senha, então quem conta é a falha; acertar a senha não pode consumir cota.
 *
 * Mesmas opções de `rateLimit`. Use o mesmo `keyPrefix`/`keyBy` nos dois lados,
 * senão cada um olha um balde diferente.
 */
export function rateLimitCheck(opts = {}) {
	const { max = 100, keyPrefix = 'global', keyBy } = opts

	return ctx => {
		const usado = contagem(chaveDe(ctx, keyPrefix, keyBy))

		ctx.set.headers['x-ratelimit-limit'] = String(max)
		ctx.set.headers['x-ratelimit-remaining'] = String(Math.max(0, max - usado))

		if (usado >= max) return bloqueio(keyPrefix)
	}
}

/**
 * Registra uma tentativa no balde lido por `rateLimitCheck`. Roda fora do
 * caminho da resposta (`afterResponse`), então não devolve nada.
 */
export function rateLimitHit(opts = {}) {
	const { max = 100, windowMs = 60_000, keyPrefix = 'global', keyBy } = opts

	return ctx => {
		hit(chaveDe(ctx, keyPrefix, keyBy), max, windowMs)
	}
}

export default rateLimit
