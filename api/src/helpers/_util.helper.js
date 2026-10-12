import { format } from 'date-fns'
import { colunasIsentasDeFuso } from './_colunas-data.js'

const CONDITIONS_AND_OPERATORS = [
	'AND',
	'OR',
	'NOT',
	'equals',
	'not',
	'in',
	'notIn',
	'lt',
	'lte',
	'gt',
	'gte',
	'contains',
	'search',
	'mode',
	'startsWith',
	'endsWith',
	'some',
	'every',
	'none',
	'is',
	'isNot'
]

const useUtils = () => {
	function convertMetadado(value, type) {
		if (!value || value === 'Não informado') return value
		if (type === 'date') return format(new Date(value), 'dd/MM/yyyy')
		if (type === 'checkbox') return value === 'true' ? 'Sim' : 'Não'
		return value
	}
	function isNumeric(value) {
		return /^-?\d+$/.test(value)
	}
	function isDateTimeString(input) {
		const dateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
		return dateTimePattern.test(input)
	}
	function validationParse(body, ignore = []) {
		for (const key in body) {
			if (typeof body[key] !== 'string') continue
			if (key === 'senha') continue
			if (ignore.includes(key)) continue
			if (isNumeric(body[key])) {
				body[key] = Number(body[key])
			} else if (isDateTimeString(body[key])) {
				body[key] = new Date(body[key].concat('Z'))
			}
		}
		return body
	}
	function ajustarFusoHorario(dataString, horasParaRemover = 3) {
		const data = new Date(dataString)
		data.setHours(data.getHours() - horasParaRemover)
		return data.toISOString()
	}
	function capitalizeFirstLetter(string) {
		return string.charAt(0).toUpperCase() + string.slice(1)
	}
	function parseArray(type, array) {
		if (Array.isArray(type) || !Array.isArray(array)) return array
		switch (type) {
			case 'Int':
				return array.map(Number)
			case 'DateTime':
				return array.map(a => new Date(a))
			case 'Boolean':
				return array.map(m => m === 'true')
			// Sem o default, tipo sem conversão (String, Uuid, Json) devolvia
			// undefined e apagava filtros como `{ id: { in: [...] } }`.
			default:
				return array
		}
	}
	function parseObject(type, json, fields) {
		if (Array.isArray(type)) return json
		if (json === null) return json
		for (const [key, value] of Object.entries(json)) {
			if (Array.isArray(value)) {
				json[key] = parseArray(type, value)
				continue
			}
			if (CONDITIONS_AND_OPERATORS.includes(key)) {
				json[key] = parseValues(fields, value)
				continue
			}
			switch (type) {
				case 'DateTime':
					json[key] = new Date(value)
					break
				case 'Int':
					json[key] = Number(value)
					break
				case 'Boolean':
					json[key] = value === 'true'
					break
			}
		}
		return json
	}
	/**
	 * @param {{name: String, isId: Boolean, kind: String, type: String, default: { name: String }}[]} fields
	 */
	function parseValues(fields = {}, json = {}, models = {}) {
		if (json === null) return json
		for (const [key, value] of Object.entries(json)) {
			if (CONDITIONS_AND_OPERATORS.includes(key)) {
				json[key] = Array.isArray(value)
					? value.map(j => parseValues(fields, j, models))
					: parseValues(fields, value, models)
				continue
			}
			const field = fields.find(f => f.name === key)
			if (!field) {
				if (typeof value === 'object')
					json[key] = parseValues(fields, value, models)
				continue
			}
			if (field.kind === 'object' && field.relationName) {
				json[key] = parseValues(models[field.type].fields, value, models)
				continue
			}
			if (field.kind !== 'scalar') continue
			// Json é conteúdo do usuário, não predicado: uma chave chamada `in`,
			// `mode` ou `not` seria reinterpretada como operador do Prisma.
			if (field.type === 'Json') continue
			if (typeof value === 'object')
				json[key] = parseObject(field.type, value, fields)
			else if (typeof value === 'string')
				switch (field.type) {
					case 'DateTime':
						json[key] = new Date(value)
						break
					case 'Int':
						json[key] = Number(value)
						break
					case 'Boolean':
						json[key] = value === 'true'
						break
				}
			else if (field.type === 'String') json[key] = String(value)
		}
		return json
	}
	const TRES_HORAS = 3 * 60 * 60 * 1000

	/**
	 * Converte para Brasília o que sai do banco, recuando 3 horas — **menos** as
	 * colunas que carregam data e mudariam de dia: os `@db.Date` e as `timestamp`
	 * gravadas com meia-noite local (ver `_colunas-data.js`).
	 *
	 * Precisa do model porque o tipo nativo não existe no runtime do Prisma 7
	 * (ver `_colunas-data.js`) e porque o mesmo nome de coluna é `date` num model
	 * e `timestamp` em outro. Sem `meta` o comportamento é o antigo: recua tudo.
	 *
	 * @param {unknown} obj resultado do Prisma, alterado no lugar
	 * @param {{model?: string, allModels?: Record<string, {fields: Array}>}} [meta]
	 */
	function adjustTimezone(obj, meta = null) {
		percorrer(obj, meta?.model ?? null, meta?.allModels ?? null)
	}

	function percorrer(valor, model, allModels) {
		if (Array.isArray(valor)) {
			for (const item of valor) percorrer(item, model, allModels)
			return
		}
		if (!valor || typeof valor !== 'object' || valor instanceof Date) return

		const somenteData = colunasIsentasDeFuso(model)
		const campos = allModels?.[model]?.fields ?? []

		// Antes o mesmo `fields` do model raiz descia em toda relação aninhada —
		// então o nome de uma coluna do filho era conferido contra a lista do pai.
		// Trocar de model ao entrar na relação é o que faz a regra valer no
		// aninhado também.
		const modelDaRelacao = new Map(
			campos.filter(f => f.kind === 'object').map(f => [f.name, f.type])
		)

		for (const chave of Object.keys(valor)) {
			const v = valor[chave]

			if (v instanceof Date) {
				if (!somenteData.has(chave)) {
					valor[chave] = new Date(v.getTime() - TRES_HORAS)
				}
			} else if (v && typeof v === 'object') {
				percorrer(v, modelDaRelacao.get(chave) ?? model, allModels)
			}
		}
	}
	function intervaloDoDiaBrasilia(dataStr) {
		const dataInicio = new Date(`${dataStr}T00:00:00-03:00`)
		const dataFim = new Date(`${dataStr}T23:59:59-03:00`)

		return {
			inicioUTC: new Date(dataInicio.getTime() - 3 * 60 * 60 * 1000),
			fimUTC: new Date(dataFim.getTime() - 3 * 60 * 60 * 1000)
		}
	}

	//#region mapping term e fields
	/**
	 * Confere se `field` casa alguma das tres notacoes que `mappingFields`
	 * aceita: campo simples (`nome`), relacao (`relacao.nome`) e lista
	 * (`tags:nome`). Sem isto a chave crua entra no `where`, o Prisma recusa a
	 * consulta inteira e a resposta sai 500 com o caminho de arquivo do servidor
	 * dentro da mensagem — o item 35 do plano de correcao.
	 *
	 * As tres notacoes so sao percorridas aqui; por isso a validacao mora neste
	 * arquivo e nao no `colunaFiltravel` do `baseController`, que so conhece
	 * coluna simples.
	 * @param {string} field
	 * @param {{name?: string, fields?: Array<object>, allModels?: object}} table
	 * @returns {boolean}
	 */
	function campoConhecido(field, table) {
		// Sem metadado nao ha o que conferir (so acontece se a extensao do Prisma
		// falhar) — vale o comportamento antigo.
		if (!table?.fields) return true

		const escalar = nome => {
			const f = table.fields.find(x => x.name === nome)
			return Boolean(f) && f.kind !== 'object'
		}

		const relacao = nome =>
			table.fields.find(
				x => x.name === nome && (x.relationName || x.kind === 'object')
			)

		const daRelacao = (nomeRelacao, nomeCampo) => {
			const rel = relacao(nomeRelacao)
			if (!rel) return false
			const modelo = table.allModels?.[rel.type]
			// Relacao sem metadado do modelo: nao da para conferir, aceita.
			if (!modelo?.fields) return true
			return modelo.fields.some(x => x.name === nomeCampo)
		}

		if (field.includes('.')) {
			const [prefixo, campo] = field.split('.')
			if (!prefixo.includes(':')) return daRelacao(prefixo, campo)

			// `lista:item.campo`: ou o prefixo e a propria tabela, e ai `item` e
			// coluna dela, ou `lista` e relacao e `item` e campo do modelo dela.
			const [lista, item] = prefixo.split(':')
			if (lista === table.name && escalar(item)) return true
			return daRelacao(lista, item)
		}

		if (field.includes(':')) {
			const [lista, campo] = field.split(':')
			const info = table.fields.find(x => x.name === lista)
			// Prefixo desconhecido: a notacao mascara campo direto (`x:nome`).
			if (!info) return escalar(campo)
			// Prefixo escalar: a notacao nao significa nada, vale o campo do prefixo.
			if (!info.relationName && info.kind !== 'object') return true
			return daRelacao(lista, campo)
		}

		return escalar(field)
	}

	function mappingFields(field, term, table) {
		const checkFields = ['Int', 'Boolean', 'Date', 'DateTime', 'Uuid']
		const isNumericTerm = /^-?\d+$/.test(term)

		// Detecção de UUID (v4 ou v7)
		const isUuid =
			typeof term === 'string' &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				term
			)

		function termPredicate(type) {
			if (isUuid) return term
			if (checkFields.includes(type)) {
				if (type === 'DateTime') {
					const { inicioUTC, fimUTC } = intervaloDoDiaBrasilia(term)
					return { gte: inicioUTC, lte: fimUTC }
				}
				return isNumericTerm ? Number(term) : term
			}
			return { contains: term, mode: 'insensitive' }
		}

		// Campo que nao casa nenhuma das tres notacoes nao vira `where`: quem
		// chama transforma o `null` em 400 nomeando o campo.
		if (!campoConhecido(field, table)) return null

		// ---------------------------------------------------------
		// CASO 1: Dot Notation (ex: usuario.email ou lista:item.campo)
		// ---------------------------------------------------------
		if (field.includes('.')) {
			const [field1, field2] = field.split('.')

			// Tratamento especial para listas aninhadas (ex: metadado:tipo_fiscalizacao.nome)
			if (field1.includes(':')) {
				const [fieldList, fieldCheck] = field1.split(':')

				// Se o fieldList é o nome da tabela atual, simplifica
				if (
					fieldList === table.name &&
					table.fields.find(f => f.name === fieldCheck)
				) {
					const directField = table.fields.find(f => f.name === fieldCheck)

					if (isUuid) return { [fieldCheck]: term }

					if (checkFields.includes(directField?.type)) {
						if (directField.type === 'DateTime') {
							const { inicioUTC, fimUTC } = intervaloDoDiaBrasilia(term)
							return { [fieldCheck]: { gte: inicioUTC, lte: fimUTC } }
						}
						return { [fieldCheck]: isNumericTerm ? Number(term) : term }
					}
					return { [fieldCheck]: { contains: term, mode: 'insensitive' } }
				}

				// Lógica padrão para listas
				if (checkFields.includes(table.fields[field2]?.type) || isUuid) {
					if (isUuid) {
						return {
							[fieldList]: { some: { [fieldCheck]: { [field2]: term } } }
						}
					}
					if (table.fields[field2]?.type === 'DateTime') {
						const { inicioUTC, fimUTC } = intervaloDoDiaBrasilia(term)
						return {
							[fieldList]: {
								some: {
									[fieldCheck]: { [field2]: { gte: inicioUTC, lte: fimUTC } }
								}
							}
						}
					}
					return {
						[fieldList]: {
							some: {
								[fieldCheck]: { [field2]: isNumericTerm ? Number(term) : term }
							}
						}
					}
				}
				return {
					[fieldList]: {
						some: {
							[fieldCheck]: {
								[field2]: { contains: term, mode: 'insensitive' }
							}
						}
					}
				}
			}

			// Relacionamento padrão (ex: usuario.id)
			const relationField = table.fields.find(f => f.name === field1)

			// Prioridade para UUID no relacionamento direto
			if (isUuid) {
				return { [field1]: { [field2]: term } }
			}

			if (relationField?.relationName) {
				const isIntField = field2.includes('_id') || field2 === 'id'
				if (isIntField || isNumericTerm) {
					return { [field1]: { [field2]: isNumericTerm ? Number(term) : term } }
				}
			}

			const field2Type = table.fields.find(f => f.name === field2)?.type
			if (checkFields.includes(field2Type)) {
				if (field2Type === 'DateTime') {
					const { inicioUTC, fimUTC } = intervaloDoDiaBrasilia(term)
					return { [field1]: { [field2]: { gte: inicioUTC, lte: fimUTC } } }
				}
				return { [field1]: { [field2]: isNumericTerm ? Number(term) : term } }
			}
			return { [field1]: { [field2]: { contains: term, mode: 'insensitive' } } }
		}

		// ---------------------------------------------------------
		// CASO 2: Colon Notation (Listas) (ex: tags:nome)
		// ---------------------------------------------------------
		else if (field.includes(':')) {
			const [fieldList, fieldCheck] = field.split(':')
			const fieldListInfo = table.fields.find(f => f.name === fieldList)

			// Se não é campo da tabela, tenta ver se é campo direto mascarado
			if (!fieldListInfo) {
				const directField = table.fields.find(f => f.name === fieldCheck)
				if (directField) {
					if (isUuid) return { [fieldCheck]: term }

					if (checkFields.includes(directField.type)) {
						if (directField.type === 'DateTime') {
							const { inicioUTC, fimUTC } = intervaloDoDiaBrasilia(term)
							return { [fieldCheck]: { gte: inicioUTC, lte: fimUTC } }
						}
						return { [fieldCheck]: isNumericTerm ? Number(term) : term }
					}
					return { [fieldCheck]: { contains: term, mode: 'insensitive' } }
				}
			}

			// Relação: o tipo do campo filtrado vem do modelo relacionado, não da
			// tabela atual. `isList` não existe no datamodel de runtime do Prisma 7,
			// então lista e relação para um registro só são indistinguíveis aqui — a
			// notação de dois pontos é, por contrato, a de lista (`some`).
			if (fieldListInfo?.isList || fieldListInfo?.relationName) {
				const checkFieldType = table.allModels?.[
					fieldListInfo.type
				]?.fields.find(f => f.name === fieldCheck)?.type

				return {
					[fieldList]: { some: { [fieldCheck]: termPredicate(checkFieldType) } }
				}
			}

			// Prefixo é escalar: `some` sobre coluna faz o Prisma rejeitar o `where`
			// inteiro. A notação não significa nada aqui, vale o campo do prefixo.
			if (fieldListInfo)
				return { [fieldList]: termPredicate(fieldListInfo.type) }

			// Prefixo desconhecido nas duas metades: melhor esforço, assume lista.
			return {
				[fieldList]: { some: { [fieldCheck]: termPredicate(undefined) } }
			}
		}

		// ---------------------------------------------------------
		// CASO 3: Campo Simples (ex: nome, id, status)
		// ---------------------------------------------------------
		const fieldType = table.fields.find(f => f.name === field)?.type

		if (isUuid) {
			return { [field]: term }
		}

		if (checkFields.includes(fieldType)) {
			if (fieldType === 'DateTime') {
				const { inicioUTC, fimUTC } = intervaloDoDiaBrasilia(term)
				return { [field]: { gte: inicioUTC, lte: fimUTC } }
			}
			return { [field]: isNumericTerm ? Number(term) : term }
		}
		return { [field]: { contains: term, mode: 'insensitive' } }
	}
	//#endregion

	const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

	/**
	 * Normaliza lista de ids de modelo com id BigInt vinda de formulário ou
	 * query string. Trata os três formatos que o front produz sozinho: array,
	 * escalar (quando a lista tem um item só) e `''` (campo vazio) — sem isso o
	 * `BigInt()` recebe `''` e lança.
	 * @param {unknown} value
	 * @returns {bigint[]} sem repetição, sem zero
	 */
	const toBigIntList = value => {
		if (value === null || value === undefined || value === '') return []

		const bruto = Array.isArray(value) ? value : [value]

		const ids = bruto
			.filter(v => v !== null && v !== undefined && v !== '' && Number(v) > 0)
			.map(v => BigInt(v))

		return [...new Set(ids)]
	}

	return {
		validationParse,
		parseValues,
		mappingFields,
		campoConhecido,
		convertMetadado,
		capitalizeFirstLetter,
		ajustarFusoHorario,
		adjustTimezone,
		delay,
		toBigIntList
	}
}

const utils = useUtils()

export { useUtils, utils }
export const {
	validationParse,
	parseValues,
	mappingFields,
	convertMetadado,
	capitalizeFirstLetter,
	ajustarFusoHorario,
	adjustTimezone,
	delay,
	toBigIntList
} = utils

export default useUtils
