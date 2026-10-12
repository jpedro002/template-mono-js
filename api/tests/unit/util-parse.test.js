import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
	adjustTimezone,
	ajustarFusoHorario,
	capitalizeFirstLetter,
	convertMetadado,
	delay,
	parseValues,
	validationParse
} from 'src/helpers'
import {
	COLUNAS_DATA,
	COLUNAS_DATA_EM_TIMESTAMP
} from 'src/helpers/_colunas-data'

const CAMPOS = [
	{ name: 'nome', type: 'String', kind: 'scalar' },
	{ name: 'quantidade', type: 'Int', kind: 'scalar' },
	{ name: 'ativo', type: 'Boolean', kind: 'scalar' },
	{ name: 'criadoEm', type: 'DateTime', kind: 'scalar' },
	{ name: 'dono', type: 'Dono', kind: 'object', relationName: 'ItemDono' }
]

const MODELOS = {
	Dono: {
		fields: [
			{ name: 'idade', type: 'Int', kind: 'scalar' },
			{ name: 'nascimento', type: 'DateTime', kind: 'scalar' }
		]
	}
}

describe('parseValues — coerção de escalares', () => {
	it('converte string numérica em Int', () => {
		expect(parseValues(CAMPOS, { quantidade: '42' })).toEqual({
			quantidade: 42
		})
	})

	it('converte string em DateTime', () => {
		const resultado = parseValues(CAMPOS, { criadoEm: '2026-08-17T10:00:00Z' })

		expect(resultado.criadoEm).toBeInstanceOf(Date)
		expect(resultado.criadoEm.toISOString()).toBe('2026-08-17T10:00:00.000Z')
	})

	it("converte 'true'/'false' em Boolean", () => {
		expect(parseValues(CAMPOS, { ativo: 'true' })).toEqual({ ativo: true })
		expect(parseValues(CAMPOS, { ativo: 'false' })).toEqual({ ativo: false })
	})

	it('força String em campo textual que recebeu número', () => {
		expect(parseValues(CAMPOS, { nome: 123 })).toEqual({ nome: '123' })
	})

	it('deixa campo desconhecido intacto', () => {
		expect(parseValues(CAMPOS, { qualquer: 'valor' })).toEqual({
			qualquer: 'valor'
		})
	})

	it('devolve null sem tentar percorrer', () => {
		expect(parseValues(CAMPOS, null)).toBeNull()
	})
})

describe('parseValues — operadores', () => {
	it('converte cada item de um `in`', () => {
		expect(
			parseValues(CAMPOS, { quantidade: { in: ['1', '2', '3'] } })
		).toEqual({
			quantidade: { in: [1, 2, 3] }
		})
	})

	it('converte datas dentro de `in`', () => {
		const resultado = parseValues(CAMPOS, {
			criadoEm: { in: ['2026-01-01T00:00:00Z'] }
		})

		expect(resultado.criadoEm.in[0]).toBeInstanceOf(Date)
	})

	it('desce em OR e converte cada ramo', () => {
		expect(
			parseValues(CAMPOS, { OR: [{ quantidade: '1' }, { quantidade: '2' }] })
		).toEqual({ OR: [{ quantidade: 1 }, { quantidade: 2 }] })
	})

	it('desce em AND e NOT', () => {
		expect(parseValues(CAMPOS, { AND: [{ ativo: 'true' }] })).toEqual({
			AND: [{ ativo: true }]
		})
		expect(parseValues(CAMPOS, { NOT: { quantidade: '9' } })).toEqual({
			NOT: { quantidade: 9 }
		})
	})

	it('não converte o valor de comparadores escalares — limitação conhecida', () => {
		// `gte` é reconhecido como operador e sai para `parseValues` com uma
		// string, que não tem campos a percorrer; a coerção não acontece.
		expect(parseValues(CAMPOS, { quantidade: { gte: '5' } })).toEqual({
			quantidade: { gte: '5' }
		})
	})
})

describe('parseValues — relações', () => {
	it('usa os campos do modelo relacionado', () => {
		expect(parseValues(CAMPOS, { dono: { idade: '30' } }, MODELOS)).toEqual({
			dono: { idade: 30 }
		})
	})

	it('converte data dentro da relação', () => {
		const resultado = parseValues(
			CAMPOS,
			{ dono: { nascimento: '1990-05-10T00:00:00Z' } },
			MODELOS
		)

		expect(resultado.dono.nascimento).toBeInstanceOf(Date)
	})

	it('desce em objeto de campo desconhecido usando os mesmos campos', () => {
		expect(
			parseValues(CAMPOS, { extra: { quantidade: '7' } }, MODELOS)
		).toEqual({
			extra: { quantidade: 7 }
		})
	})
})

describe('adjustTimezone', () => {
	it('recua 3 horas em cada Date', () => {
		const objeto = { criadoEm: new Date('2026-08-17T12:00:00.000Z') }

		adjustTimezone(objeto)

		expect(objeto.criadoEm.toISOString()).toBe('2026-08-17T09:00:00.000Z')
	})

	it('desce em objetos aninhados e arrays', () => {
		const objeto = {
			itens: [{ criadoEm: new Date('2026-08-17T12:00:00.000Z') }],
			meta: { atualizadoEm: new Date('2026-08-17T12:00:00.000Z') }
		}

		adjustTimezone(objeto)

		expect(objeto.itens[0].criadoEm.toISOString()).toBe(
			'2026-08-17T09:00:00.000Z'
		)
		expect(objeto.meta.atualizadoEm.toISOString()).toBe(
			'2026-08-17T09:00:00.000Z'
		)
	})

	it('trata array na raiz', () => {
		const lista = [{ criadoEm: new Date('2026-08-17T12:00:00.000Z') }]

		adjustTimezone(lista)

		expect(lista[0].criadoEm.toISOString()).toBe('2026-08-17T09:00:00.000Z')
	})

	// As colunas isentas vêm de `COLUNAS_DATA` / `COLUNAS_DATA_EM_TIMESTAMP`
	// (`src/helpers/_colunas-data.js`). O schema do template não tem coluna de
	// data pura, então o teste registra models fictícios e limpa no final.
	describe('colunas de data pura', () => {
		beforeEach(() => {
			COLUNAS_DATA.Evento = ['data_dia']
			COLUNAS_DATA.Reserva = ['data_dia']
			COLUNAS_DATA_EM_TIMESTAMP.Periodo = ['inicio']
		})
		afterEach(() => {
			delete COLUNAS_DATA.Evento
			delete COLUNAS_DATA.Reserva
			delete COLUNAS_DATA_EM_TIMESTAMP.Periodo
		})

		it('não mexe em coluna `@db.Date` do model', () => {
			const objeto = { data_dia: new Date('2026-08-17T00:00:00.000Z') }

			adjustTimezone(objeto, { model: 'Evento' })

			expect(objeto.data_dia.toISOString()).toBe('2026-08-17T00:00:00.000Z')
		})

		it('recua coluna de mesmo nome em model onde ela é timestamp', () => {
			const objeto = { data_dia: new Date('2026-08-17T12:00:00.000Z') }

			adjustTimezone(objeto, { model: 'SemMapa' })

			expect(objeto.data_dia.toISOString()).toBe('2026-08-17T09:00:00.000Z')
		})

		it('não mexe em coluna `timestamp` que carrega data', () => {
			const objeto = {
				inicio: new Date('2026-03-18T00:00:00.000Z'),
				updated_at: new Date('2026-08-17T12:00:00.000Z')
			}

			adjustTimezone(objeto, { model: 'Periodo' })

			expect(objeto.inicio.toISOString()).toBe('2026-03-18T00:00:00.000Z')
			expect(objeto.updated_at.toISOString()).toBe('2026-08-17T09:00:00.000Z')
		})

		it('troca de model ao descer numa relação', () => {
			const objeto = {
				data_dia: new Date('2026-08-17T00:00:00.000Z'),
				filho: { data_dia: new Date('2026-08-17T12:00:00.000Z') }
			}
			const allModels = {
				Evento: {
					fields: [
						{ name: 'data_dia', kind: 'scalar', type: 'DateTime' },
						{ name: 'filho', kind: 'object', type: 'SemMapa' }
					]
				}
			}

			adjustTimezone(objeto, { model: 'Evento', allModels })

			// `data_dia` é data pura no pai e instante no filho.
			expect(objeto.data_dia.toISOString()).toBe('2026-08-17T00:00:00.000Z')
			expect(objeto.filho.data_dia.toISOString()).toBe(
				'2026-08-17T09:00:00.000Z'
			)
		})
	})

	it('ignora valores que não são Date', () => {
		const objeto = { nome: 'texto', n: 1, nulo: null }

		adjustTimezone(objeto)

		expect(objeto).toEqual({ nome: 'texto', n: 1, nulo: null })
	})
})

describe('validationParse', () => {
	it('transforma string inteira em número', () => {
		expect(validationParse({ idade: '30' })).toEqual({ idade: 30 })
	})

	it('aceita número negativo', () => {
		expect(validationParse({ saldo: '-15' })).toEqual({ saldo: -15 })
	})

	it('deixa decimal como string — o padrão só casa inteiros', () => {
		expect(validationParse({ preco: '12.5' })).toEqual({ preco: '12.5' })
	})

	it("converte 'YYYY-MM-DD HH:mm' em Date UTC", () => {
		const resultado = validationParse({ inicio: '2026-08-17 10:30' })

		expect(resultado.inicio.toISOString()).toBe('2026-08-17T10:30:00.000Z')
	})

	it('nunca mexe no campo senha', () => {
		expect(validationParse({ senha: '123456' })).toEqual({ senha: '123456' })
	})

	it('respeita a lista de campos ignorados', () => {
		expect(validationParse({ cep: '01001000' }, ['cep'])).toEqual({
			cep: '01001000'
		})
	})

	it('não toca em valores que não são string', () => {
		const data = new Date('2026-01-01T00:00:00Z')

		expect(validationParse({ ativo: true, quando: data })).toEqual({
			ativo: true,
			quando: data
		})
	})
})

describe('utilitários diversos', () => {
	it('convertMetadado formata data em dd/MM/yyyy', () => {
		expect(convertMetadado('2026-08-17T00:00:00', 'date')).toBe('17/08/2026')
	})

	it('convertMetadado traduz checkbox para Sim/Não', () => {
		expect(convertMetadado('true', 'checkbox')).toBe('Sim')
		expect(convertMetadado('false', 'checkbox')).toBe('Não')
	})

	it("convertMetadado devolve 'Não informado' sem formatar", () => {
		expect(convertMetadado('Não informado', 'date')).toBe('Não informado')
	})

	it('convertMetadado devolve o valor cru para tipo desconhecido', () => {
		expect(convertMetadado('abc', 'texto')).toBe('abc')
	})

	it('capitalizeFirstLetter sobe só a primeira letra', () => {
		expect(capitalizeFirstLetter('joão pedro')).toBe('João pedro')
	})

	it('ajustarFusoHorario recua as horas pedidas', () => {
		expect(ajustarFusoHorario('2026-08-17T12:00:00.000Z')).toBe(
			'2026-08-17T09:00:00.000Z'
		)
		expect(ajustarFusoHorario('2026-08-17T12:00:00.000Z', 5)).toBe(
			'2026-08-17T07:00:00.000Z'
		)
	})

	it('delay resolve depois do tempo pedido', async () => {
		const inicio = performance.now()

		await delay(15)

		expect(performance.now() - inicio).toBeGreaterThanOrEqual(10)
	})
})
