import { Elysia } from 'elysia'
import { z } from 'zod'
import { settings } from './config'
import { errorHandler } from './helpers'
import { versao } from './helpers/_versao.helper'
import { authenticate, authorize } from './middleware'
import { prisma } from './services/_prisma.service'

// Prisma devolve BIGINT como BigInt nativo (id/FK BigInt), e
// JSON.stringify não sabe serializar esse tipo — vira 500 em qualquer rota
// que retorne um desses campos. toJSON aqui cobre o processo inteiro, uma vez.
BigInt.prototype.toJSON = function () {
	return Number.parseInt(this.toString(), 10)
}

// O SDK do OTel é criado aqui dentro. Em produção este módulo já foi avaliado
// pelo preload (`bun --preload ./src/instrumentation.js`) — é o que garante que
// a instrumentação do `pg` chegue antes do `@prisma/adapter-pg` carregar o `pg`.
// Preload e import resolvem para o mesmo módulo, então não há dois SDKs.
import { otelPlugin } from './instrumentation'
import {
	corsPlugin,
	jwtPlugin,
	loggerPlugin,
	metricsPlugin,
	openapiPlugin
} from './plugins'
import { segurancaRoutes, testeRoutes } from './routes'

const RespostaVivo = z.object({ status: z.literal('ok') })

const RespostaPronto = z.object({
	status: z.enum(['ok', 'indisponivel'])
})

const RespostaVersao = z.object({
	status: z.enum(['ok', 'degradado']),
	banco: z.object({
		ok: z.boolean(),
		latencia_ms: z.number().nullable(),
		erro: z.string().optional()
	}),
	uptime_s: z.number(),
	versao: z.object({
		commit: z.string().nullable(),
		branch: z.string().nullable(),
		build_em: z.string().nullable()
	}),
	agora: z.string()
})

// Teto curto: banco travado não pode segurar a resposta da sonda até o
// timeout do orquestrador.
async function pingBanco(log) {
	const inicio = performance.now()
	try {
		await Promise.race([
			prisma.$queryRaw`SELECT 1`,
			new Promise((_, rejeitar) =>
				setTimeout(() => rejeitar(new Error('timeout de 2 s')), 2000)
			)
		])
		return { ok: true, latencia_ms: Math.round(performance.now() - inicio) }
	} catch (e) {
		log.warn('saude: banco nao respondeu', { err: e })
		return { ok: false, latencia_ms: null, erro: 'banco não respondeu' }
	}
}

// Liveness: só prova que o processo responde HTTP. Não toca no banco — banco
// fora do ar não se resolve reiniciando a API, e reiniciar em cascata piora.
const vivo = () => ({ status: 'ok' })

// Readiness: pode receber tráfego? Sem detalhes no corpo — é pública.
async function pronto({ set, log }) {
	const banco = await pingBanco(log)
	if (!banco.ok) set.status = 503
	return { status: banco.ok ? 'ok' : 'indisponivel' }
}

// Diagnóstico interno: commit, uptime e latência do banco. Exige
// `sistema:read` — permissão, não nome de role.
async function diagnostico({ set, log }) {
	const banco = await pingBanco(log)
	if (!banco.ok) set.status = 503
	return {
		status: banco.ok ? 'ok' : 'degradado',
		banco,
		uptime_s: Math.round(process.uptime()),
		versao,
		agora: new Date().toISOString()
	}
}

export function createApp() {
	const app = new Elysia({
		aot: true
	})
		// Primeiro de todos: o plugin de trace envolve o ciclo inteiro da
		// requisição, então tudo que for registrado depois cai dentro do span raiz.
		.use(otelPlugin)
		.use(loggerPlugin)
		.use(metricsPlugin)
		.use(corsPlugin)
		.use(openapiPlugin)
		.use(jwtPlugin)
		.onError(errorHandler)
		.get('/', vivo, {
			response: { 200: RespostaVivo },
			detail: {
				tags: ['API Info'],
				summary: 'Liveness (alias de /healthz)',
				description: 'Processo vivo. Não consulta o banco.'
			}
		})
		.get('/healthz', vivo, {
			response: { 200: RespostaVivo },
			detail: {
				tags: ['API Info'],
				summary: 'Liveness',
				description:
					'Processo vivo. Não consulta o banco — é o que o healthcheck do Docker lê; falha aqui reinicia o container.'
			}
		})
		.get('/ready', pronto, {
			response: { 200: RespostaPronto, 503: RespostaPronto },
			detail: {
				tags: ['API Info'],
				summary: 'Readiness',
				description:
					'Pronta para tráfego (`SELECT 1` com teto de 2 s). 503 tira a instância do balanceador sem matar o processo.'
			}
		})
		.get('/version', diagnostico, {
			beforeHandle: [authenticate, authorize('sistema:read')],
			response: { 200: RespostaVersao, 503: RespostaVersao },
			detail: {
				tags: ['API Info'],
				summary: 'Versão e diagnóstico (sistema:read)',
				description:
					'Commit, uptime e latência do banco. Compare `versao.commit` com o último commit da `main` para saber se o deploy está atualizado.'
			}
		})
		// Bots pedem isto o tempo todo; sem a rota, cada pedido virava um 404 no log.
		.get(
			'/robots.txt',
			() =>
				new Response('User-agent: *\nDisallow: /\n', {
					headers: { 'content-type': 'text/plain' }
				}),
			{ detail: { hide: true } }
		)
		.use(segurancaRoutes)

	// `/api/teste/cards` é o CRUD de exemplo do template: `baseController` puro,
	// sem escopo nenhum. Montado em produção, era mais uma superfície aberta a
	// quem tivesse `cards:*` sem servir tela nenhuma.
	if (settings.NODE_ENV !== 'production') app.use(testeRoutes)

	return app
}
