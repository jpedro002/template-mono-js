import { Elysia } from 'elysia'
import { z } from 'zod'

/**
 * Booleano vindo da query string.
 *
 * `z.coerce.boolean()` não serve: a query chega como texto e `Boolean('false')`
 * é `true`, então o parâmetro só saberia dizer sim. Mora aqui, e não no
 * `_schemas.js` de um domínio, porque é do contrato de query.
 */
const booleanoDeQuery = z
	.union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
	.transform(v => v === true || v === 'true' || v === '1')

/**
 * Chave estrangeira opcional vinda de formulário.
 *
 * `z.coerce.number()` não serve sozinho: o `select` de uma tela devolve `''`
 * quando nada foi escolhido, e `Number('')` é `0`, que `.positive()` recusa —
 * o salvar responde 400 justamente no caso mais comum, o de não ter o vínculo.
 * `''` aqui significa o mesmo que `null`: sem vínculo.
 */
const idOpcional = z.preprocess(
	v => (v === '' ? null : v),
	z.coerce.number().int().positive().nullish()
)

/**
 * Base router: monta as 6 rotas padrão de um controller em uma instância Elysia.
 * @param {object} controller - Controller com os métodos base (all, fetch, one, post, put, del)
 * @param {object} options - Opções do router
 * @param {string} options.tag - Tag para agrupar as rotas na documentação OpenAPI
 * @param {string} [options.summary] - Resumo opcional das rotas
 * @param {object} [options.schemas] - Schemas Zod para validação (createSchema, updateSchema, entitySchema)
 * @param {Array} [options.middleware] - Middleware (beforeHandle) aplicado em todas as rotas
 * @param {Array} [options.listMiddleware] - Middleware específico para GET / e GET /all
 * @param {Array} [options.getMiddleware] - Middleware específico para GET /:id
 * @param {Array} [options.postMiddleware] - Middleware específico para POST /
 * @param {Array} [options.putMiddleware] - Middleware específico para PUT /:id
 * @param {Array} [options.deleteMiddleware] - Middleware específico para DELETE /:id
 * @param {string} [options.entityName] - Nome da entidade (usado para gerar descrições)
 * @returns {Elysia} Instância pronta para ser montada com `.use()`
 */
function baseRouter(controller, options = {}) {
	const {
		tag,
		summary = '',
		schemas = {},
		middleware = [],
		listMiddleware = middleware,
		getMiddleware = middleware,
		postMiddleware = middleware,
		putMiddleware = middleware,
		deleteMiddleware = middleware,
		entityName = tag?.toLowerCase() || 'item',
		// Modelos com id BigInt autoincrement precisam de outro
		// formato de :id — passe z.string().regex(/^\d+$/) nesse caso.
		idSchema = z.uuid(),
		// Campos de query só das duas rotas de listagem, para o controller que
		// lê algo além do filtro padrão (ex: `incluir_inativas`). O schema de
		// query é `z.object`, que descarta chave não declarada — sem isto o
		// parâmetro nunca chega ao `ctx.query` e a flag fica presa no default.
		listQuery = {},
		// O mesmo para `GET /:id`. Separado de `listQuery` porque a rota de
		// edição precisa alcançar o registro inativo mesmo quando a listagem
		// que levou até ela não pediu inativos.
		getQuery = {},
		// E o mesmo para `PUT /:id`, pelo mesmo motivo do `getQuery`: o
		// formulário que abriu um registro inativo precisa conseguir salvá-lo.
		// Sem isto o predicado do controller volta ao default, o Prisma não
		// acha a linha (P2025) e o salvar responde 404.
		putQuery = {},
		// Cadastro que não se exclui. Não basta tirar a ação da tela: a rota
		// montada continua respondendo a quem a chama direto.
		semDelete = false,
		// Recurso cujo `del` próprio recusa a exclusão com 409 em vez de
		// apagar. Opcional, e não fixo nas respostas do DELETE, porque só dois
		// recursos têm essa guarda: declarar 409 nos outros catorze anunciaria
		// no contrato uma resposta que eles não sabem dar.
		deleteConflito = false
	} = options

	const { createSchema, updateSchema, entitySchema } = schemas

	const { all, fetch, one, post, put, del } = controller

	/**
	 * Front-ends que serializam array como `campo[]=a&campo[]=b` (ex.: axios
	 * default) mandam a chave literal `campo[]`. A chave dos schemas abaixo é
	 * `campo` — sem essa normalização o Zod nunca casa a chave, o campo some
	 * do objeto validado e o transform devolve `[]` como se nada tivesse sido
	 * enviado.
	 * @param {Record<string, unknown>} query
	 * @returns {Record<string, unknown>}
	 */
	function normalizeBracketArrayKeys(query) {
		if (!query || typeof query !== 'object') return query

		return Object.entries(query).reduce((acc, [key, value]) => {
			const bareKey = key.endsWith('[]') ? key.slice(0, -2) : key

			if (bareKey in acc) {
				const existing = acc[bareKey]
				acc[bareKey] = [
					...(Array.isArray(existing) ? existing : [existing]),
					...(Array.isArray(value) ? value : [value])
				]
			} else {
				acc[bareKey] = value
			}

			return acc
		}, {})
	}

	// Use default middleware if specific ones not provided
	const listMiddlewareArray =
		listMiddleware?.length > 0 ? listMiddleware : middleware
	const getMiddlewareArray =
		getMiddleware?.length > 0 ? getMiddleware : middleware
	const postMiddlewareArray =
		postMiddleware?.length > 0 ? postMiddleware : middleware
	const putMiddlewareArray =
		putMiddleware?.length > 0 ? putMiddleware : middleware
	const deleteMiddlewareArray =
		deleteMiddleware?.length > 0 ? deleteMiddleware : middleware

	const errorSchema = z.object({
		error: z.string().optional(),
		message: z.string(),
		statusCode: z.number().optional(),
		details: z.any().optional(),
		errors: z.any().optional()
	})

	const paginationSchema = z.object({
		page: z.number(),
		rowCount: z.number(),
		pageCount: z.number(),
		pageSize: z.number()
	})

	const queryParamsSchema = z.object({
		term: z.string().optional(),
		fields: z
			.union([z.array(z.string()), z.string(), z.undefined()])
			.optional()
			.transform(val => {
				if (Array.isArray(val)) {
					return val
				}
				if (typeof val === 'string') {
					return [val]
				}
				return []
			}),
		order: z.string().optional(),
		orderDirection: z.enum(['asc', 'desc']).default('asc').optional(),
		fspecifics: z
			.union([
				z
					.string()
					.regex(
						/^[^$]+\$=?[^$]+$/,
						'Formato esperado: field$value (contains) ou field$=value (igualdade exata)'
					),
				z.array(
					z
						.string()
						.regex(
							/^[^$]+\$=?[^$]+$/,
							'Formato esperado: field$value (contains) ou field$=value (igualdade exata)'
						)
				)
			])
			.optional()
			.transform(val => {
				if (Array.isArray(val)) {
					return val
				}
				if (typeof val === 'string') {
					return [val]
				}
				return []
			}),
		select: z
			.union([z.array(z.string()), z.string(), z.undefined()])
			.optional()
			.transform(val => {
				// Converte array em string (separada por vírgula) para manter compatibilidade
				if (Array.isArray(val)) {
					return val.join(',')
				}
				return val
			})
	})

	const fetchQueryParamsSchema = queryParamsSchema.extend({
		page: z.coerce.number().positive().optional().default(1),
		pageSize: z.coerce.number().positive().optional().default(20)
	})

	const singleResourceQuerySchema = z.object({
		select: z
			.union([z.array(z.string()), z.string(), z.undefined()])
			.optional()
			.transform(val => {
				if (Array.isArray(val)) {
					return val
				}
				if (typeof val === 'string') {
					return [val]
				}
				return []
			})
	})

	const allQuerySchema = z.preprocess(
		normalizeBracketArrayKeys,
		queryParamsSchema.extend(listQuery)
	)
	const fetchQuerySchema = z.preprocess(
		normalizeBracketArrayKeys,
		fetchQueryParamsSchema.extend(listQuery)
	)
	const singleQuerySchema = z.preprocess(
		normalizeBracketArrayKeys,
		singleResourceQuerySchema
	)
	const getQuerySchema = z.preprocess(
		normalizeBracketArrayKeys,
		singleResourceQuerySchema.extend(getQuery)
	)
	const putQuerySchema = z.preprocess(
		normalizeBracketArrayKeys,
		singleResourceQuerySchema.extend(putQuery)
	)

	const idParamsSchema = z.object({
		id: idSchema
	})

	const router = new Elysia()
		// Rota POST - Criar novo registro
		.post('/', post, {
			beforeHandle: postMiddlewareArray,
			...(createSchema && { body: createSchema }),
			query: singleQuerySchema,
			response: {
				201: entitySchema || z.any(),
				400: errorSchema
			},
			detail: {
				tags: [tag],
				summary: summary ? `${summary} - Criar` : `Criar novo ${entityName}`,
				description: `Cria um novo ${entityName}`
			}
		})

		// Rota PUT - Atualizar registro existente
		.put('/:id', put, {
			beforeHandle: putMiddlewareArray,
			params: idParamsSchema,
			...(updateSchema && { body: updateSchema }),
			query: putQuerySchema,
			response: {
				200: entitySchema || z.any(),
				400: errorSchema,
				404: errorSchema
			},
			detail: {
				tags: [tag],
				summary: summary
					? `${summary} - Atualizar`
					: `Atualizar ${entityName} existente`,
				description: `Atualiza um ${entityName} existente`
			}
		})

		// Rota GET - Listar todos os registros
		.get('/all', all, {
			beforeHandle: listMiddlewareArray,
			query: allQuerySchema,
			response: {
				200: z.object({
					data: z.array(entitySchema || z.any()),
					rowCount: z.number()
				})
			},
			detail: {
				tags: [tag],
				summary: summary
					? `${summary} - Listar`
					: `Listar todos os ${entityName}s`,
				description: `Lista todos os ${entityName}s com opções de filtro`
			}
		})

		// Rota GET / - Busca paginada
		.get('/', fetch, {
			beforeHandle: listMiddlewareArray,
			query: fetchQuerySchema,
			response: {
				200: z.object({
					data: z.array(entitySchema || z.any()),
					pagination: paginationSchema
				})
			},
			detail: {
				tags: [tag],
				summary: summary
					? `${summary} - Buscar`
					: `Buscar ${entityName}s com paginação`,
				description: `Busca ${entityName}s com paginação e filtros`
			}
		})

		// Rota GET /:id - Obter um registro por ID
		.get('/:id', one, {
			beforeHandle: getMiddlewareArray,
			params: idParamsSchema,
			query: getQuerySchema,
			response: {
				200: entitySchema || z.any(),
				404: errorSchema
			},
			detail: {
				tags: [tag],
				summary: summary ? `${summary} - Obter` : `Obter ${entityName} por ID`,
				description: `Obtém um ${entityName} específico pelo ID`
			}
		})

	if (semDelete) return router

	return (
		router
			// Rota DELETE /:id - Excluir registro por ID
			.delete('/:id', del, {
				beforeHandle: deleteMiddlewareArray,
				params: idParamsSchema,
				response: {
					204: z.null(),
					404: errorSchema,
					...(deleteConflito && { 409: errorSchema })
				},
				detail: {
					tags: [tag],
					summary: summary
						? `${summary} - Excluir`
						: `Excluir ${entityName} por ID`,
					description: `Exclui um ${entityName} específico pelo ID`
				}
			})
	)
}

export { baseRouter, booleanoDeQuery, idOpcional }
export default baseRouter
