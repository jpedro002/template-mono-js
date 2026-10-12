import { status } from 'elysia'
import { useUtils } from 'src/helpers'
import {
	dependeDoRegistro,
	escopoDe,
	ignoraPolitica,
	negado,
	permitePolitica
} from 'src/policies'
import { prisma } from 'src/services'

function baseController(model, params = {}) {
	const {
		select = null,
		include = null,
		omit = null,
		where: baseWhere = null,
		allowedFields = null,
		sensitiveFields = ['senha', 'password', 'token', 'hash'],
		// Models com id BigInt autoincrement (em vez de uuid) — o Prisma exige o tipo nativo no `where`,
		// então a string de `params.id` precisa ser convertida antes de
		// chegar em qualquer query.
		idType = 'uuid',
		// Models com soft delete (coluna `deleted_at`). Com `softDelete: true`, o DELETE vira UPDATE do
		// campo e toda leitura (all/fetch/one/put) passa a esconder as linhas
		// já apagadas — sem isso o registro "excluído" continuaria
		// aparecendo em qualquer listagem.
		softDelete = false,
		softDeleteField = 'deleted_at',
		// Filtro de `fspecifics` que atravessa relação: `{ nome_do_filtro:
		// (valor, ctx) => predicado }`. Existe porque `buildWherePredicate` monta
		// `{ campo: valor }` sobre coluna da própria tabela e nada mais — filtrar
		// por uma coluna de relação era 500.
		//
		// O nome do filtro é contrato da rota e o predicado é decidido aqui, de
		// propósito: aceitar caminho aninhado vindo da query
		// (`instituicoes.estado_id$=3`) transformaria `fspecifics` em leitura
		// arbitrária de qualquer relação do model.
		filtros = null,
		// Recurso da política por registro (`src/policies`). Com ele, listagens
		// aplicam o `escopo` e one/put/del conferem a regra no registro.
		policy = null,
		// Coluna que recebe o id de quem criou (`createdById`). O valor sai da
		// sessão, nunca do body.
		campoDono = null
	} = params
	const { mappingFields, mapOrder } = useUtils()

	function castId(id) {
		return idType === 'bigint' ? BigInt(id) : id
	}

	/**
	 * Valida e processa campos solicitados dinamicamente
	 * @param {string|null} requestSelect - Campo select da requisição (ex: "nome,email")
	 * @returns {object|null} Objeto select validado ou null
	 */
	function validateAndBuildSelect(requestSelect) {
		// Se não foi solicitado select dinâmico, retorna o select estático
		if (!requestSelect || typeof requestSelect !== 'string') {
			return select
		}

		// Se allowedFields não está configurado, não permitir select dinâmico por segurança
		if (!Array.isArray(allowedFields)) {
			return select
		}

		const requestedFields = requestSelect
			.split(',')
			.map(f => f.trim())
			.filter(f => f.length > 0)

		// Validar cada campo
		const validatedFields = requestedFields.reduce((acc, field) => {
			// Verificar se o campo é permitido
			if (!allowedFields.includes(field)) {
				return acc
			}

			// Verificar se o campo é sensível
			if (sensitiveFields.includes(field)) {
				return acc
			}

			acc[field] = true
			return acc
		}, {})

		// Se nenhum campo válido foi encontrado, retorna select estático
		if (Object.keys(validatedFields).length === 0) {
			return select
		}

		return validatedFields
	}

	/**
	 * Constrói opções de query do Prisma
	 * @param {string|null} dynamicSelect - Campo select dinâmico da requisição
	 * @returns {object} Opções com select/include/omit
	 */
	function buildQueryOptions(dynamicSelect = null) {
		const options = {}
		const finalSelect = validateAndBuildSelect(dynamicSelect)

		// Se há select dinâmico, use APENAS select (não use omit)
		// Prisma não permite usar select e omit ao mesmo tempo
		if (finalSelect) {
			options.select = finalSelect
		} else {
			// Se não há select dinâmico, use as opções estáticas (include ou omit)
			if (select) options.select = select
			if (include) options.include = include
			if (omit) options.omit = omit
		}

		return options
	}

	/**
	 * Aplica o predicado base do controller (ex: `{ deletedAt: null }`) sobre um
	 * where já montado. Sem isso não há como esconder registros de um domínio
	 * inteiro — soft delete vazaria em toda listagem.
	 *
	 * Aceita função do contexto quando o recorte depende de quem pediu
	 * (ex: restringir a listagem aos registros do próprio usuário).
	 * @param {object} where
	 * @param {object|null} ctx - Contexto da Elysia
	 * @returns {object}
	 */
	function withBaseWhere(where = {}, ctx = null) {
		const extra = typeof baseWhere === 'function' ? baseWhere(ctx) : baseWhere
		const softDeleteFilter = softDelete ? { [softDeleteField]: null } : null
		return { ...where, ...(extra || {}), ...(softDeleteFilter || {}) }
	}

	/**
	 * Coluna que `fspecifics` pode filtrar: escalar ou enum da própria tabela.
	 *
	 * Relação fica fora porque `{ instituicoes: '3' }` é `where` inválido — o
	 * Prisma recusa a consulta inteira. Campo inexistente também: o `where`
	 * seguia com a chave crua e o erro do Prisma vazava como 500 com caminho de
	 * arquivo do servidor na mensagem.
	 * @param {string} field
	 * @param {{fields?: Array<{name: string, kind: string}>}} table
	 * @returns {boolean}
	 */
	function colunaFiltravel(field, table) {
		const coluna = table?.fields?.find(f => f.name === field)
		return Boolean(coluna) && coluna.kind !== 'object'
	}

	function erroDeFiltro(field) {
		const error = new Error(
			`Filtro inválido: '${field}' não é um campo filtrável deste recurso.`
		)
		error.statusCode = 400
		return error
	}

	function erroDeBusca(field) {
		const error = new Error(
			`Busca inválida: '${field}' não é um campo pesquisável deste recurso.`
		)
		error.statusCode = 400
		return error
	}

	/**
	 * Constrói o predicado where baseado em termo e filtros específicos
	 * @param {string|null} term - Termo de busca
	 * @param {Array} fields - Campos onde buscar o termo
	 * @param {Array} fspecifics - Filtros específicos
	 * @param {object|null} ctx - Contexto da Elysia
	 * @returns {Promise<object>} Objeto com where
	 */
	async function buildWherePredicate(term, fields, fspecifics, ctx = null) {
		const predicate = { where: withBaseWhere({}, ctx) }
		const table = prisma[model].getDatabase()

		// Aplicar busca por termo se fornecido
		if (term && Array.isArray(fields) && fields.length > 0) {
			const or = fields.map(m => {
				const predicado = mappingFields(m, term, table)
				// `mappingFields` devolve null quando o campo nao casa nenhuma das
				// tres notacoes. Antes o `filter` engolia o caso e a chave crua ia
				// para o Prisma pelo caminho de "melhor esforco": 500 com caminho de
				// arquivo do servidor na resposta (item 35).
				if (!predicado) throw erroDeBusca(m)
				return predicado
			})

			if (or.length > 0) predicate.where.OR = or
		}

		// Aplicar filtros específicos
		if (Array.isArray(fspecifics) && fspecifics.length > 0) {
			const pedidos = fspecifics
				.filter(m => m && typeof m === 'string')
				.map(m => {
					const sepIndex = m.indexOf('$')
					if (sepIndex === -1) return null
					const field = m.slice(0, sepIndex)
					let value = m.slice(sepIndex + 1)

					// `campo$=valor`: igualdade exata, não o "contains" que
					// mappingFields aplica por padrão a campo String. Necessário
					// sempre que o valor pode ser substring de outro valor válido
					// da coluna (ex: status "ativo" é substring de "inativo" —
					// sem isso o filtro nunca exclui o segundo).
					const exact = value.startsWith('=')
					if (exact) value = value.slice(1)

					return { field, value, exact }
				})
				.filter(m => m?.field && m.value) // Validar estrutura

			const validFspecifics = []

			for (const { field, value, exact } of pedidos) {
				const doControlador = filtros?.[field]

				if (doControlador) {
					const predicadoDaRelacao = await doControlador(value, ctx)
					if (predicadoDaRelacao) validFspecifics.push(predicadoDaRelacao)
					continue
				}

				// Sem metadado não há o que conferir (só acontece se a extensão do
				// Prisma falhar) — vale o comportamento antigo.
				if (table && !colunaFiltravel(field, table)) throw erroDeFiltro(field)

				const predicado = exact
					? { [field]: value }
					: mappingFields(field, value, table)

				if (!predicado) throw erroDeFiltro(field)
				validFspecifics.push(predicado)
			}

			if (validFspecifics.length > 0) {
				predicate.where = {
					...predicate.where,
					AND: validFspecifics
				}
			}
		}

		if (policy) {
			const escopo = await escopoDe(ctx?.user, 'read', policy)
			if (escopo) {
				predicate.where = {
					...predicate.where,
					AND: [...(predicate.where.AND ?? []), escopo]
				}
			}
		}

		return predicate
	}

	/**
	 * Carrega o registro do `:id` e confere a política. Fora do escopo de
	 * leitura é 404, não 403: responder "existe, mas não é seu" vazaria a
	 * existência do registro. Visível mas sem a regra da `acao` é 403.
	 */
	async function registroAutorizado(ctx, acao) {
		if (!dependeDoRegistro(policy, acao)) return null
		if (await ignoraPolitica(ctx.user, policy)) return null

		const escopo = await escopoDe(ctx.user, 'read', policy)
		const where = withBaseWhere({ id: castId(ctx.params.id) }, ctx)
		const registro = await prisma[model].findFirst({
			where: escopo ? { ...where, AND: [escopo] } : where
		})

		if (
			!registro ||
			!(await permitePolitica(ctx.user, 'read', policy, registro))
		) {
			throw negado(404, 'Registro não localizado.')
		}
		if (
			acao !== 'read' &&
			!(await permitePolitica(ctx.user, acao, policy, registro))
		) {
			throw negado(403, 'Você não tem permissão para alterar este registro.')
		}
		return registro
	}

	/**
	 * Processa e valida a ordenação
	 * @param {string|null} order - Campo para ordenar
	 * @param {string} orderDirection - Direção da ordenação (asc/desc)
	 * @returns {object|null} Objeto orderBy para Prisma
	 */
	function buildOrderBy(order, orderDirection = 'asc') {
		if (!order) return {}

		if (typeof order === 'string') {
			const direction = ['asc', 'desc'].includes(orderDirection?.toLowerCase())
				? orderDirection.toLowerCase()
				: 'asc'
			return { [order]: direction }
		}

		// Se order é um array ou objeto complexo, usar mapOrder
		return mapOrder(order) || {}
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	async function all(ctx) {
		const {
			fields = [],
			term = null,
			order = null,
			orderDirection = 'asc',
			fspecifics = [],
			select: dynamicSelect = null
		} = ctx.query

		const predicate = await buildWherePredicate(term, fields, fspecifics, ctx)
		const orderBy = buildOrderBy(order, orderDirection)

		const [rowCount, data] = await Promise.all([
			prisma[model].count({ ...predicate }),
			prisma[model].findMany({
				...predicate,
				...(Object.keys(orderBy).length > 0 && { orderBy }),
				...buildQueryOptions(dynamicSelect)
			})
		])
		return { data, rowCount }
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	async function fetch(ctx) {
		const {
			fields = [],
			term = null,
			order = null,
			orderDirection = 'asc',
			page = 1,
			pageSize = 20,
			fspecifics = [],
			select: dynamicSelect = null
		} = ctx.query

		const predicate = await buildWherePredicate(term, fields, fspecifics, ctx)
		const orderBy = buildOrderBy(order, orderDirection)

		const [rowCount, data] = await Promise.all([
			prisma[model].count({ ...predicate }),
			prisma[model].findMany({
				...predicate,
				take: Number(pageSize),
				skip: (Number(page) - 1) * Number(pageSize),
				...(Object.keys(orderBy).length > 0 && { orderBy }),
				...buildQueryOptions(dynamicSelect)
			})
		])
		return {
			data,
			pagination: {
				page: Number(page),
				rowCount,
				pageCount: Math.ceil(rowCount / Number(pageSize)) || 1,
				pageSize: Number(pageSize)
			}
		}
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	async function one(ctx) {
		if (policy) await registroAutorizado(ctx, 'read')
		const { params, query } = ctx
		const { id } = params
		const { select: dynamicSelect = null } = query

		const data = await prisma[model].findUnique({
			where: withBaseWhere({ id: castId(id) }, ctx),
			...buildQueryOptions(dynamicSelect)
		})
		if (!data) {
			const error = new Error('Registro não localizado.')
			error.statusCode = 404
			throw error
		}
		return data
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	async function post({ body, query, user }) {
		const { id: _, ...rest } = body
		const { select: dynamicSelect = null } = query

		if (policy && !(await permitePolitica(user, 'create', policy, rest))) {
			throw negado(403, 'Você não tem permissão para criar este registro.')
		}

		const data = await prisma[model].create({
			data: { ...rest, ...(campoDono && { [campoDono]: user?.id ?? null }) },
			...buildQueryOptions(dynamicSelect)
		})
		return status(201, data)
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	async function put(ctx) {
		if (policy) await registroAutorizado(ctx, 'update')
		const { params, body, query } = ctx
		const { id } = params
		const { id: _, ...rest } = body
		const { select: dynamicSelect = null } = query
		// Dono não muda por edição: trocar o `createdById` pelo body seria
		// transferir o registro (e a política) para outra pessoa.
		if (campoDono) delete rest[campoDono]

		const data = await prisma[model].update({
			data: { ...rest },
			where: withBaseWhere({ id: castId(id) }, ctx),
			...buildQueryOptions(dynamicSelect)
		})
		return data
	}

	/**
	 * @param {import('elysia').Context} ctx
	 */
	async function del(ctx) {
		if (policy) await registroAutorizado(ctx, 'delete')
		const { params, set } = ctx
		const { id } = params
		if (softDelete) {
			await prisma[model].update({
				where: withBaseWhere({ id: castId(id) }, ctx),
				data: { [softDeleteField]: new Date() }
			})
		} else {
			await prisma[model].delete({
				where: withBaseWhere({ id: castId(id) }, ctx)
			})
		}
		set.status = 204
		return null
	}

	return {
		all,
		fetch,
		one,
		post,
		put,
		del,
		// Exposto para o controller que precisa contar sobre o **mesmo** recorte
		// da listagem (ex: o resumo por situação dos códigos de acesso). Sem
		// isto, o resumo remontaria o `where` à mão e divergiria do `fetch` no
		// primeiro filtro novo.
		buildWherePredicate
	}
}

export { baseController }
