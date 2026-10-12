import { describe, expect, it } from 'bun:test'
import { mappingFields } from 'src/helpers'
import { prismaModels } from '../helpers/prisma-mock'

/** Mesma forma que `prisma[model].getDatabase()` devolve em produção. */
function tabela(nome) {
	const { dbName, ...resto } = prismaModels[nome]
	return { name: dbName, allModels: prismaModels, ...resto }
}

const UUID = '01924f8a-0000-7000-8000-000000000001'

/**
 * O schema real não tem campo Int nem Boolean em lista, então esses ramos usam
 * uma tabela sintética — o resto usa os metadados de verdade.
 */
const tabelaSintetica = {
	name: 'itens',
	fields: [
		{ name: 'nome', type: 'String', kind: 'scalar' },
		{ name: 'quantidade', type: 'Int', kind: 'scalar' },
		{ name: 'ativo', type: 'Boolean', kind: 'scalar' },
		{ name: 'criadoEm', type: 'DateTime', kind: 'scalar' },
		{
			name: 'tags',
			type: 'Tag',
			kind: 'object',
			isList: true,
			relationName: 'ItemTags'
		},
		{ name: 'dono', type: 'Dono', kind: 'object', relationName: 'ItemDono' }
	],
	allModels: {
		Tag: {
			fields: [
				{ name: 'nome', type: 'String' },
				{ name: 'peso', type: 'Int' },
				{ name: 'criadoEm', type: 'DateTime' }
			]
		},
		Dono: {
			fields: [
				{ name: 'nome', type: 'String' },
				{ name: 'idade', type: 'Int' }
			]
		}
	}
}

describe('mappingFields — campo simples', () => {
	it('texto vira busca parcial sem diferenciar maiúsculas', () => {
		expect(mappingFields('title', 'relatório', tabela('Card'))).toEqual({
			title: { contains: 'relatório', mode: 'insensitive' }
		})
	})

	it('UUID vira igualdade exata', () => {
		expect(mappingFields('id', UUID, tabela('Card'))).toEqual({ id: UUID })
	})

	it('UUID tem prioridade sobre o tipo declarado do campo', () => {
		expect(mappingFields('title', UUID, tabela('Card'))).toEqual({
			title: UUID
		})
	})

	it('campo Int com termo numérico vira número', () => {
		expect(mappingFields('quantidade', '42', tabelaSintetica)).toEqual({
			quantidade: 42
		})
	})

	it('campo Int com termo não numérico mantém a string', () => {
		expect(mappingFields('quantidade', 'abc', tabelaSintetica)).toEqual({
			quantidade: 'abc'
		})
	})

	it('campo desconhecido devolve null — quem chama transforma em 400', () => {
		// Antes virava `{ inexistente: { contains } }`, a chave crua chegava ao
		// Prisma e a resposta saia 500 com o caminho do arquivo do servidor
		// dentro da mensagem. Item 35 do plano de correcao.
		expect(mappingFields('inexistente', 'x', tabela('Card'))).toBeNull()
	})

	it('campo Boolean sai como string — a coerção fica com a extension do Prisma', () => {
		// `parseValues` no `$allOperations` converte 'true' em true antes da query.
		expect(mappingFields('ativo', 'true', tabelaSintetica)).toEqual({
			ativo: 'true'
		})
	})
})

describe('mappingFields — data vira intervalo do dia', () => {
	it('DateTime gera gte/lte cobrindo o dia inteiro', () => {
		const resultado = mappingFields('createdAt', '2026-08-17', tabela('Card'))

		expect(resultado.createdAt.gte.toISOString()).toBe(
			'2026-08-17T00:00:00.000Z'
		)
		expect(resultado.createdAt.lte.toISOString()).toBe(
			'2026-08-17T23:59:59.000Z'
		)
	})

	it('o intervalo é naive, casando com o deslocamento de -3h da leitura', () => {
		// `adjustTimezone` subtrai 3h de toda data que sai do banco; o filtro
		// aplica o mesmo deslocamento para os dois lados baterem.
		const resultado = mappingFields('criadoEm', '2026-01-01', tabelaSintetica)

		expect(resultado.criadoEm.gte.getUTCHours()).toBe(0)
		expect(resultado.criadoEm.lte.getUTCHours()).toBe(23)
	})
})

describe('mappingFields — notação de ponto (relação)', () => {
	it('user.name filtra no relacionamento', () => {
		expect(mappingFields('user.name', 'joão', tabela('UserRole'))).toEqual({
			user: { name: { contains: 'joão', mode: 'insensitive' } }
		})
	})

	it('UUID no relacionamento vira igualdade', () => {
		expect(mappingFields('user.id', UUID, tabela('UserRole'))).toEqual({
			user: { id: UUID }
		})
	})

	it('campo terminado em _id com termo numérico vira número', () => {
		expect(mappingFields('dono.idade', '30', tabelaSintetica)).toEqual({
			dono: { idade: 30 }
		})
	})

	// LIMITAÇÃO: o tipo do campo depois do ponto é procurado nos campos da tabela
	// PAI, não nos do modelo relacionado. Os dois testes abaixo fixam o
	// comportamento atual — os dois lados da limitação.
	it('não acha o tipo quando o nome não existe na tabela pai', () => {
		// User.createdAt é DateTime, mas UserRole não tem `createdAt`: em vez de
		// intervalo de datas o filtro vira busca parcial.
		expect(
			mappingFields('user.createdAt', '2026-08-17', tabela('UserRole'))
		).toEqual({
			user: { createdAt: { contains: '2026-08-17', mode: 'insensitive' } }
		})
	})

	it('campo que a relação não tem devolve null', () => {
		// Role nao tem `expiresAt`; UserRole tem. Antes o intervalo saia aplicado
		// a relacao errada — `{ role: { expiresAt: { gte, lte } } }` —, que o
		// Prisma recusa. Agora o pedido e recusado com nome do campo. Item 35.
		expect(
			mappingFields('role.expiresAt', '2026-08-17', tabela('UserRole'))
		).toBeNull()
	})
})

describe('mappingFields — notação de dois pontos (lista)', () => {
	it('lista:campo vira some com busca parcial', () => {
		expect(mappingFields('userRoles:roleId', 'abc', tabela('User'))).toEqual({
			userRoles: { some: { roleId: { contains: 'abc', mode: 'insensitive' } } }
		})
	})

	it('lista:campo com UUID vira some com igualdade', () => {
		expect(mappingFields('userRoles:roleId', UUID, tabela('User'))).toEqual({
			userRoles: { some: { roleId: UUID } }
		})
	})

	it('lista:campo Int converte o termo', () => {
		expect(mappingFields('tags:peso', '7', tabelaSintetica)).toEqual({
			tags: { some: { peso: 7 } }
		})
	})

	it('lista:campo DateTime vira intervalo dentro do some', () => {
		const resultado = mappingFields(
			'tags:criadoEm',
			'2026-08-17',
			tabelaSintetica
		)

		expect(resultado.tags.some.criadoEm.gte).toBeInstanceOf(Date)
	})

	it('quando o prefixo não é lista, cai no campo direto', () => {
		expect(mappingFields('qualquer:title', 'x', tabela('Card'))).toEqual({
			title: { contains: 'x', mode: 'insensitive' }
		})
	})

	// `some` só existe em relação de lista: emitido sobre escalar, o Prisma
	// rejeita o `where` inteiro.
	it('prefixo escalar filtra o próprio prefixo, sem `some`', () => {
		expect(mappingFields('title:sub', 'x', tabela('Card'))).toEqual({
			title: { contains: 'x', mode: 'insensitive' }
		})
	})

	it('prefixo escalar respeita o tipo do campo', () => {
		expect(mappingFields('quantidade:sub', '42', tabelaSintetica)).toEqual({
			quantidade: 42
		})
	})

	// `isList` não existe no datamodel de runtime do Prisma 7: sem ele o tipo do
	// campo era procurado na tabela PAI, e todo filtro de lista virava `contains`.
	it('lista sem `isList` nos metadados usa o tipo do modelo relacionado', () => {
		const resultado = mappingFields(
			'userRoles:expiresAt',
			'2026-08-17',
			tabela('User')
		)

		expect(resultado.userRoles.some.expiresAt.gte).toBeInstanceOf(Date)
		expect(resultado.userRoles.some.expiresAt.lte).toBeInstanceOf(Date)
	})
})

describe('mappingFields — lista aninhada (lista:campo.sub)', () => {
	it('simplifica quando o prefixo é a própria tabela', () => {
		const table = tabela('Card')

		expect(mappingFields(`${table.name}:title.x`, 'texto', table)).toEqual({
			title: { contains: 'texto', mode: 'insensitive' }
		})
	})

	it('gera some aninhado para lista de verdade', () => {
		expect(
			mappingFields('userRoles:role.name', 'ADMIN', tabela('User'))
		).toEqual({
			userRoles: {
				some: { role: { name: { contains: 'ADMIN', mode: 'insensitive' } } }
			}
		})
	})

	it('UUID em lista aninhada vira igualdade', () => {
		expect(mappingFields('userRoles:role.id', UUID, tabela('User'))).toEqual({
			userRoles: { some: { role: { id: UUID } } }
		})
	})
})
