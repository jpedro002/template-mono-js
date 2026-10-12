import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { useUtils } from 'src/helpers'
import { metrics } from 'src/helpers/_metrics.helper'
import { Prisma, PrismaClient } from '../../prisma/generated/prisma/client'

/**
 * O pool é criado aqui, não pelo adapter.
 *
 * `new PrismaPg({ connectionString })` faria o adapter abrir um pool interno ao
 * qual ninguém tem referência — e sem referência não há como publicar conexões
 * em uso, ociosas e fila de espera. Passando um `pg.Pool` pronto, o adapter usa
 * este, e o `_metrics.helper` ganha uma janela para o único recurso realmente
 * escasso da API. Saturação de pool é o que faz a latência explodir sem que CPU
 * ou banco pareçam ocupados; sem essa série, o diagnóstico é chute.
 */
const inteiro = (valor, padrao) => {
	const n = Number(valor)
	return Number.isInteger(n) && n > 0 ? n : padrao
}

// Sem limites, uma consulta presa (relatório, exportação) segura a conexão para
// sempre e, com as 10 do padrão ocupadas, a API inteira para — health 503 e
// P2028 em rota que não tem nada a ver. Os tetos fazem a falha ficar na
// consulta lenta, e o valor vem do ambiente para cada deploy ajustar.
const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL ?? '',
	max: inteiro(process.env.DB_POOL_MAX, 10),
	// Espera por conexão livre: estoura com erro em vez de pendurar a requisição.
	connectionTimeoutMillis: inteiro(process.env.DB_POOL_TIMEOUT_MS, 10_000),
	idleTimeoutMillis: inteiro(process.env.DB_POOL_IDLE_MS, 30_000),
	// O Postgres cancela a consulta que passar disso e devolve a conexão.
	statement_timeout: inteiro(process.env.DB_STATEMENT_TIMEOUT_MS, 60_000)
})

// `disposeExternalPool`: como o pool passou a ser nosso, é preciso dizer ao
// adapter que ele pode fechá-lo no `$disconnect`. Sem isso, o processo fica com
// conexões abertas depois de desconectar o Prisma.
const adapter = new PrismaPg(pool, { disposeExternalPool: true })

metrics.db.registrarPool(() => ({
	total: pool.totalCount,
	idle: pool.idleCount,
	waiting: pool.waitingCount,
	max: pool.options?.max ?? 10
}))

const { parseValues, adjustTimezone } = useUtils()

let prisma = new PrismaClient({ adapter })

const middleware = async params => {
	const { model, args } = params
	if (model && (args.where || args.data || args.create || args.update)) {
		const dbInfo = prisma[model]?.getDatabase?.()
		if (!dbInfo) return params

		const { fields, allModels } = dbInfo
		const { where, data, create, update } = args
		if (where && Object.keys(where).length)
			params.args.where = parseValues(fields, where, allModels)
		if (data && Object.keys(data).length)
			params.args.data = parseValues(fields, data, allModels)
		if (create && Object.keys(create).length)
			params.args.create = parseValues(fields, create, allModels)
		if (update && Object.keys(update).length)
			params.args.update = parseValues(fields, update, allModels)
	}
	return params
}

// Apply extensions with safer error handling
prisma = prisma.$extends({
	model: {
		$allModels: {
			getDatabase() {
				try {
					const context = Prisma.getExtensionContext(this)
					const allModels = context.$parent._runtimeDataModel.models
					const { dbName, ...rest } = allModels[context.$name]
					return { name: dbName, allModels, ...rest }
				} catch (_error) {
					console.warn(`Warning: getDatabase() not available for this model`)
					return null
				}
			},
			async truncate() {
				const context = Prisma.getExtensionContext(this)
				const database = context.getDatabase()
				if (!database) throw new Error('Database info not available')
				const query = `TRUNCATE TABLE ${database.name}`
				await prisma.$executeRaw(Prisma.raw(query))
				return 0
			}
		}
	},
	query: {
		$allModels: {
			async $allOperations({ query, ...params }) {
				const { model, args } = await middleware(params)

				// Cronometra a operação do Prisma, não a do Postgres: o que se mede
				// aqui inclui espera por conexão no pool, `parseValues` e
				// `adjustTimezone`. É justamente o número que o usuário sente. O tempo
				// puro do SQL vem no span do `pg`, dentro deste.
				const inicio = performance.now()
				try {
					const result = await query(args)
					metrics.db.operacao({
						model,
						operation: params.operation,
						durationSeconds: (performance.now() - inicio) / 1000
					})
					const dbInfo = prisma[model]?.getDatabase?.()
					if (dbInfo) {
						// `model` é o nome no Prisma, não o da tabela: `dbInfo.name` já
						// passou pelo `@@map` e não serve para achar as colunas `date`.
						adjustTimezone(result, { model, allModels: dbInfo.allModels })
					}
					return result
				} catch (err) {
					// Consulta que falhou também é duração — e é a que mais interessa.
					// `error.type` recebe o código do Prisma (P2002, P2025…), que é
					// fechado; a mensagem, que é texto livre, ficaria de fora de
					// qualquer jeito para não abrir uma série por variação de texto.
					metrics.db.operacao({
						model,
						operation: params.operation,
						durationSeconds: (performance.now() - inicio) / 1000,
						errorType: err?.code || err?.name || 'unknown'
					})
					throw err
				}
			}
		}
	}
})

export { prisma }
export default prisma
