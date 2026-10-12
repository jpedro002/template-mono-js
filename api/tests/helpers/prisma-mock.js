import { mock } from 'bun:test'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../../prisma/generated/prisma/client'

/**
 * Metadados reais do schema (nomes de tabela, tipos de campo, relações).
 *
 * Construir o PrismaClient não abre conexão — só a primeira query abre. Isso
 * deixa `getDatabase()` devolver a mesma coisa que devolveria em produção, então
 * `mappingFields`/`parseValues` rodam de verdade em cima do schema real em vez
 * de um mock de metadados que envelheceria sozinho.
 */
const metaClient = new PrismaClient({
	adapter: new PrismaPg({
		connectionString: 'postgresql://mock:mock@127.0.0.1:1/mock'
	})
})

const models = metaClient._runtimeDataModel.models

function databaseFor(modelName) {
	const { dbName, ...rest } = models[modelName]
	return { name: dbName, allModels: models, ...rest }
}

const OPERATIONS = [
	'findMany',
	'findUnique',
	'findUniqueOrThrow',
	'findFirst',
	'findFirstOrThrow',
	'count',
	'create',
	'createMany',
	'update',
	'updateMany',
	'upsert',
	'delete',
	'deleteMany',
	'aggregate',
	'groupBy'
]

function defaultResult(operation) {
	if (operation === 'findMany' || operation === 'groupBy') return []
	if (operation === 'count') return 0
	if (operation.startsWith('find')) return null
	if (operation === 'createMany' || operation === 'updateMany')
		return { count: 0 }
	if (operation === 'deleteMany') return { count: 0 }
	if (operation === 'aggregate') return {}
	return {}
}

function buildDelegate(modelName) {
	const delegate = {
		getDatabase: () => databaseFor(modelName),
		truncate: mock(async () => 0)
	}
	for (const operation of OPERATIONS) {
		delegate[operation] = mock(async () => defaultResult(operation))
	}
	return delegate
}

/** Client falso com a mesma superfície que a aplicação usa. */
export const prismaMock = {}

function install() {
	for (const key of Object.keys(prismaMock)) delete prismaMock[key]

	for (const modelName of Object.keys(models)) {
		const delegate = buildDelegate(modelName)
		// A aplicação acessa tanto `prisma.User` quanto `prisma.userRole`.
		prismaMock[modelName] = delegate
		prismaMock[modelName[0].toLowerCase() + modelName.slice(1)] = delegate
	}

	prismaMock.$transaction = mock(async operations =>
		typeof operations === 'function'
			? operations(prismaMock)
			: Promise.all(operations)
	)
	prismaMock.$executeRaw = mock(async () => 0)
	prismaMock.$queryRaw = mock(async () => [])
	prismaMock.$connect = mock(async () => undefined)
	prismaMock.$disconnect = mock(async () => undefined)
}

install()

/** Recria todos os mocks — chamado no `beforeEach` global. */
export function resetPrismaMock() {
	install()
}

/**
 * Erro do Prisma de verdade, para exercitar os ramos P2002/P2025/P2003 do
 * handler global (que usa `instanceof`).
 */
export function prismaError(code, meta = {}) {
	return new Prisma.PrismaClientKnownRequestError(`Mock Prisma error ${code}`, {
		code,
		clientVersion: 'mock',
		meta
	})
}

export { models as prismaModels }
