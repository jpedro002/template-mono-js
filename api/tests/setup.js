import './helpers/env'
import { beforeEach, mock } from 'bun:test'
import { resetConsole } from './helpers/console'
import { prismaMock, resetPrismaMock } from './helpers/prisma-mock'

/**
 * Trocar `_prisma.service` alcança tudo: o barrel `src/services` reexporta a
 * partir dele e o `authorizationService` importa do barrel. Um único ponto de
 * substituição cobre controllers, services e middleware.
 */
mock.module('src/services/_prisma.service', () => ({
	prisma: prismaMock,
	default: prismaMock
}))

const { storage } = await import('src/services/_storage.service')
const { cache } = await import('src/services/_cache.service')

beforeEach(async () => {
	resetPrismaMock()
	// Driver de memória guarda os objetos num Map do processo — sem limpar, um
	// teste enxerga o que o anterior gravou.
	storage._objetos?.clear()
	// Cache de permissão (5 min) e de estado de sessão (30 s) moram no
	// `cacheService`, global ao processo: sem limpar, um teste enxerga as
	// permissões concedidas ou a sessão revogada no anterior.
	await cache.clear()
	resetConsole()
})
