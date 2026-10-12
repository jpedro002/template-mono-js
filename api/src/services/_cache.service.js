import { RedisClient } from 'bun'
import { settings } from 'src/config'
import { logger, metrics } from 'src/helpers'

/**
 * Cache de leitura com driver trocável — mesma forma do kit de storage:
 * o domínio fala com uma interface só e o `CACHE_DRIVER` decide quem atende.
 *
 * | Driver   | Onde guarda            | Para quê |
 * |----------|------------------------|----------|
 * | `memory` | Map do processo        | dev, teste e instância única |
 * | `redis`  | Redis/Valkey           | produção com mais de uma instância |
 * | `none`   | lugar nenhum           | desligar sem mexer em código |
 *
 * Duas regras que valem para os três:
 *
 * 1. **Falha de cache nunca vira falha de requisição.** Redis fora do ar, chave
 *    corrompida, timeout — tudo cai em `miss` e a origem responde. É por isso
 *    que toda operação está dentro de try/catch: um cache que derruba a rota é
 *    pior que não ter cache.
 * 2. **O valor trafega serializado nos dois drivers.** O de memória poderia
 *    guardar a referência direta e ser mais rápido, mas aí quem alterasse o
 *    objeto devolvido corromperia a entrada — e o bug não apareceria em
 *    produção, onde o driver é outro. Comportamento igual vale o `JSON.parse`.
 *
 * O `JSON.stringify` daqui converte BigInt para número (ids BigInt do Prisma
 * não serializam): sem isso, `stringify` lança e toda escrita no cache viraria erro
 * silencioso.
 */

const PREFIX = settings.CACHE_PREFIX

function serializar(valor) {
	return JSON.stringify(valor, (_chave, v) =>
		typeof v === 'bigint' ? Number(v) : v
	)
}

//#region driver memory

/**
 * Map do processo com expiração preguiçosa: a entrada vencida só é removida
 * quando alguém a procura (ou quando o teto de entradas obriga uma limpeza).
 * Varredura periódica custaria um timer para ganhar memória que ninguém está
 * esperando.
 */
function makeMemoryDriver() {
	const entradas = new Map()

	function purgarVencidas(agora) {
		for (const [chave, entrada] of entradas) {
			if (entrada.expiraEm <= agora) entradas.delete(chave)
		}
	}

	return {
		driver: 'memory',
		_entradas: entradas,

		async get(chave) {
			const entrada = entradas.get(chave)
			if (!entrada) return undefined

			if (entrada.expiraEm <= Date.now()) {
				entradas.delete(chave)
				return undefined
			}

			return entrada.payload
		},

		async set(chave, payload, ttl) {
			const agora = Date.now()

			// Teto de entradas: primeiro joga fora o que já venceu; se ainda
			// estourar, descarta a mais antiga inserida. Sem isso o Map cresce até
			// o processo morrer — cache em memória sem limite é vazamento com
			// outro nome.
			if (entradas.size >= settings.CACHE_MAX_ENTRIES) {
				purgarVencidas(agora)
				if (entradas.size >= settings.CACHE_MAX_ENTRIES) {
					entradas.delete(entradas.keys().next().value)
				}
			}

			entradas.set(chave, { payload, expiraEm: agora + ttl * 1000 })
		},

		async del(chave) {
			entradas.delete(chave)
		},

		async delPrefix(prefixo) {
			let removidas = 0
			for (const chave of entradas.keys()) {
				if (chave.startsWith(prefixo)) {
					entradas.delete(chave)
					removidas++
				}
			}
			return removidas
		},

		async clear() {
			entradas.clear()
		},

		async ping() {
			return true
		},

		async close() {}
	}
}

//#endregion

//#region driver redis

function makeRedisDriver() {
	// Cliente do próprio Bun (RESP nativo, sem dependência externa) — mesma
	// escolha do storage, que usa o `Bun.S3Client` em vez de um SDK.
	const client = new RedisClient(settings.REDIS_URL, {
		connectionTimeout: settings.REDIS_CONNECT_TIMEOUT,
		autoReconnect: true,
		enableAutoPipelining: true
	})

	// Sem handler, uma falha de conexão vira rejeição não tratada no processo.
	client.onclose = erro => {
		logger.warn('cache: conexão com o Redis encerrada', {
			err: erro?.message
		})
	}

	return {
		driver: 'redis',
		_client: client,

		async get(chave) {
			const payload = await client.get(chave)
			return payload === null ? undefined : payload
		},

		async set(chave, payload, ttl) {
			await client.send('SET', [chave, payload, 'EX', String(ttl)])
		},

		async del(chave) {
			await client.del(chave)
		},

		/**
		 * `SCAN` em vez de `KEYS`: `KEYS` percorre o keyspace inteiro travando o
		 * servidor, e o Redis desta API não é exclusivo do cache.
		 */
		async delPrefix(prefixo) {
			let cursor = '0'
			let removidas = 0

			do {
				const [proximo, chaves] = await client.send('SCAN', [
					cursor,
					'MATCH',
					`${prefixo}*`,
					'COUNT',
					'500'
				])
				cursor = String(proximo)

				if (chaves.length > 0) {
					// UNLINK libera a memória fora da thread principal; DEL de um lote
					// grande bloqueia o servidor.
					await client.send('UNLINK', chaves)
					removidas += chaves.length
				}
			} while (cursor !== '0')

			return removidas
		},

		// Nunca é FLUSHDB: o banco pode não ser só nosso. Limpar tudo é limpar o
		// que está sob o prefixo da aplicação.
		async clear() {
			await this.delPrefix(PREFIX)
		},

		async ping() {
			await client.send('PING', [])
			return true
		},

		async close() {
			client.close()
		}
	}
}

//#endregion

//#region driver none

function makeNoopDriver() {
	return {
		driver: 'none',
		async get() {
			return undefined
		},
		async set() {},
		async del() {},
		async delPrefix() {
			return 0
		},
		async clear() {},
		async ping() {
			return true
		},
		async close() {}
	}
}

//#endregion

function criarDriver() {
	if (settings.CACHE_DRIVER === 'redis') return makeRedisDriver()
	if (settings.CACHE_DRIVER === 'none') return makeNoopDriver()
	return makeMemoryDriver()
}

const driver = criarDriver()

/**
 * Corta a operação no `CACHE_TIMEOUT`. O timer é limpo no `finally` — sem isso
 * cada leitura deixaria um timer pendurado e o processo não fecharia sozinho.
 */
function comTimeout(promessa, operation, ms) {
	if (!Number.isFinite(ms) || ms <= 0) return promessa

	let timer
	const estouro = new Promise((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`cache: timeout de ${operation}`)),
			ms
		)
	})

	return Promise.race([promessa, estouro]).finally(() => clearTimeout(timer))
}

// Limpeza varre o keyspace por prefixo e não roda no caminho da requisição —
// cortá-la nos mesmos 200 ms deixaria chave velha para trás justamente quando
// alguém pediu para apagar tudo.
const TIMEOUT_LIMPEZA = 30_000

/**
 * Toda operação passa por aqui: erro de cache vira log + métrica e devolve o
 * valor neutro. Quem chama não precisa saber que o cache existe para funcionar.
 */
async function protegido(operation, ns, fn, neutro) {
	const limite =
		operation === 'invalidate' || operation === 'clear'
			? TIMEOUT_LIMPEZA
			: settings.CACHE_TIMEOUT

	try {
		return await comTimeout(Promise.resolve(fn()), operation, limite)
	} catch (erro) {
		metrics.cache.operacao({ operation, namespace: ns, result: 'error' })
		logger.warn('cache: operação falhou', {
			operation,
			namespace: ns,
			driver: driver.driver,
			err: erro?.message
		})
		return neutro
	}
}

/**
 * Chave estável a partir de um objeto de filtros: as chaves são ordenadas para
 * que `{ano, uf}` e `{uf, ano}` caiam na mesma entrada, e o que for
 * `undefined`/`''` sai fora — senão "sem filtro" e "filtro vazio" viram duas
 * entradas do mesmo resultado.
 */
function chaveDe(valor) {
	if (valor === null || valor === undefined) return ''
	if (typeof valor !== 'object') return String(valor)

	const partes = Object.entries(valor)
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([chave, v]) => `${chave}=${chaveDe(v)}`)

	return partes.join('&')
}

function chaveCompleta(ns, chave) {
	return `${PREFIX}${ns}:${chave}`
}

/**
 * Recorte nomeado do cache. Existe para que a invalidação seja por assunto
 * (`cacheLista.invalidate()`) em vez de por chave — quem importa dados novos não
 * tem como conhecer as combinações de filtro que estão guardadas.
 */
function namespace(ns, opcoes = {}) {
	const ttlPadrao = opcoes.ttl ?? settings.CACHE_TTL

	const escopo = {
		ns,

		async get(chave) {
			const completa = chaveCompleta(ns, chaveDe(chave))
			const payload = await protegido('get', ns, () => driver.get(completa))

			if (payload === undefined) {
				metrics.cache.operacao({
					operation: 'get',
					namespace: ns,
					result: 'miss'
				})
				return undefined
			}

			metrics.cache.operacao({ operation: 'get', namespace: ns, result: 'hit' })
			// Entrada corrompida (mudança de formato, escrita de outra versão da
			// aplicação) é tratada como ausência, não como erro da rota.
			try {
				return JSON.parse(payload)
			} catch {
				await escopo.del(chave)
				return undefined
			}
		},

		async set(chave, valor, ttl = ttlPadrao) {
			const completa = chaveCompleta(ns, chaveDe(chave))
			await protegido('set', ns, () =>
				driver.set(completa, serializar(valor), ttl)
			)
			metrics.cache.operacao({ operation: 'set', namespace: ns, result: 'ok' })
		},

		async del(chave) {
			const completa = chaveCompleta(ns, chaveDe(chave))
			await protegido('del', ns, () => driver.del(completa))
		},

		/** Descarta tudo do namespace — é o gancho pós-importação de dados. */
		async invalidate() {
			const removidas = await protegido(
				'invalidate',
				ns,
				() => driver.delPrefix(chaveCompleta(ns, '')),
				0
			)
			logger.info('cache: namespace invalidado', {
				namespace: ns,
				removidas,
				driver: driver.driver
			})
			return removidas
		},

		/**
		 * Ler do cache ou produzir e guardar. `undefined` não é guardado: seria
		 * indistinguível de ausência na leitura seguinte.
		 */
		async wrap(chave, produzir, ttl = ttlPadrao) {
			const guardado = await escopo.get(chave)
			if (guardado !== undefined) return guardado

			const valor = await produzir()
			if (valor !== undefined) await escopo.set(chave, valor, ttl)
			return valor
		},

		/**
		 * Envolve um handler da Elysia. A chave sai da query e dos params — nunca
		 * do usuário: estas rotas devolvem dado público igual para todo mundo, e
		 * misturar identidade na chave só multiplicaria entradas idênticas. Em rota
		 * cujo resultado dependa de quem pediu, passe um `chave` próprio que inclua
		 * o recorte.
		 */
		handler(fn, opcoesRota = {}) {
			// `chave` aceita função (recebe o contexto) ou valor fixo — rota sem
			// filtro nenhum não precisa de closure para dizer "só existe uma
			// entrada".
			const montarChave =
				typeof opcoesRota.chave === 'function'
					? opcoesRota.chave
					: opcoesRota.chave !== undefined
						? () => opcoesRota.chave
						: ctx => ({ ...(ctx.params || {}), ...(ctx.query || {}) })

			return async function handlerComCache(ctx) {
				return escopo.wrap(
					montarChave(ctx),
					() => fn(ctx),
					opcoesRota.ttl ?? ttlPadrao
				)
			}
		}
	}

	return escopo
}

const cache = {
	driver: driver.driver,
	namespace,
	chaveDe,
	ping: () => protegido('ping', 'global', () => driver.ping(), false),
	clear: () => protegido('clear', 'global', () => driver.clear()),
	close: () => driver.close(),
	// exportado para teste
	_driver: driver
}

export { cache }
export default cache
