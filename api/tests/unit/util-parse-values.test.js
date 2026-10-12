import { describe, expect, it } from 'bun:test'
import { parseValues } from 'src/helpers'
import { prismaModels } from '../helpers/prisma-mock'

const camposDe = modelo => prismaModels[modelo].fields

/**
 * Nenhum model do schema tem campo `Json` — o kit de arquivos não persiste
 * nada. Os campos abaixo têm a mesma forma do datamodel real (`kind`, `type`),
 * que é tudo que o `parseValues` lê.
 */
const CAMPOS_SINTETICOS = [
	{ name: 'key', kind: 'scalar', type: 'String' },
	{ name: 'profile', kind: 'scalar', type: 'String' },
	{ name: 'size', kind: 'scalar', type: 'Int' },
	{ name: 'createdAt', kind: 'scalar', type: 'DateTime' },
	{ name: 'metadata', kind: 'scalar', type: 'Json' }
]

const UUID = '01924f8a-0000-7000-8000-00000000000c'

/**
 * `parseValues` roda em TODA query pelo middleware do `_prisma.service`, então
 * um predicado que ele destrói silenciosamente vira filtro que não filtra.
 */
describe('parseValues — operadores de lista', () => {
	it('preserva `in` de String (era apagado por falta de default no switch)', () => {
		const where = parseValues(
			CAMPOS_SINTETICOS,
			{ key: { in: ['a/b.pdf', 'c/d.pdf'] } },
			prismaModels
		)

		expect(where.key.in).toEqual(['a/b.pdf', 'c/d.pdf'])
	})

	it('preserva `in` de campo id', () => {
		const where = parseValues(
			camposDe('Card'),
			{ id: { in: [UUID] } },
			prismaModels
		)

		expect(where.id.in).toEqual([UUID])
	})

	it('preserva `notIn` de String', () => {
		const where = parseValues(
			CAMPOS_SINTETICOS,
			{ profile: { notIn: ['avatar'] } },
			prismaModels
		)

		expect(where.profile.notIn).toEqual(['avatar'])
	})

	it('continua convertendo `in` de Int', () => {
		const where = parseValues(
			CAMPOS_SINTETICOS,
			{ size: { in: ['10', '20'] } },
			prismaModels
		)

		expect(where.size.in).toEqual([10, 20])
	})

	it('continua convertendo `in` de DateTime', () => {
		const where = parseValues(
			CAMPOS_SINTETICOS,
			{ createdAt: { in: ['2026-01-01T00:00:00.000Z'] } },
			prismaModels
		)

		expect(where.createdAt.in[0]).toBeInstanceOf(Date)
	})
})

/**
 * Campo Json é conteúdo do usuário, não predicado: passar pelo parser de query
 * transformava `{ tags: [...] }` em `{ tags: undefined }` e reinterpretava
 * chaves com nome de operador (`mode`, `not`, `in`).
 */
describe('parseValues — campo Json', () => {
	it('mantém array dentro do metadata', () => {
		const data = parseValues(
			CAMPOS_SINTETICOS,
			{ metadata: { tags: ['contrato', 'assinado'] } },
			prismaModels
		)

		expect(data.metadata.tags).toEqual(['contrato', 'assinado'])
	})

	it('mantém chave com nome de operador do Prisma', () => {
		const data = parseValues(
			CAMPOS_SINTETICOS,
			{ metadata: { mode: 'rascunho', not: 'valor', in: ['x'] } },
			prismaModels
		)

		expect(data.metadata).toEqual({
			mode: 'rascunho',
			not: 'valor',
			in: ['x']
		})
	})

	it('não converte string de data dentro do metadata', () => {
		const data = parseValues(
			CAMPOS_SINTETICOS,
			{ metadata: { vencimento: '2026-01-01T00:00:00.000Z' } },
			prismaModels
		)

		expect(data.metadata.vencimento).toBe('2026-01-01T00:00:00.000Z')
	})
})
