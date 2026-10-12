import { beforeEach, describe, expect, it } from 'bun:test'
import { del, get, post, put } from '../helpers/app'
import { loginAs } from '../helpers/auth'
import { card, list, uuidV7 } from '../helpers/factories'
import { prismaError, prismaMock } from '../helpers/prisma-mock'

const BASE = '/api/teste/cards'

let cookie

beforeEach(async () => {
	;({ cookie } = await loginAs({ permissions: ['cards:*'] }))
})

const argsFindMany = () => prismaMock.Card.findMany.mock.calls.at(-1)[0]

describe('GET /cards/all', () => {
	it('devolve a lista com a contagem', async () => {
		const cards = list(card, 3)
		prismaMock.Card.findMany.mockResolvedValue(cards)
		prismaMock.Card.count.mockResolvedValue(3)

		const { status, body } = await get(`${BASE}/all`, { cookie })

		expect(status).toBe(200)
		expect(body.rowCount).toBe(3)
		expect(body.data).toHaveLength(3)
	})

	it('não pagina', async () => {
		await get(`${BASE}/all`, { cookie })

		expect(argsFindMany().take).toBeUndefined()
	})
})

describe('GET /cards — paginação', () => {
	it('devolve o bloco de paginação', async () => {
		prismaMock.Card.findMany.mockResolvedValue(list(card, 2))
		prismaMock.Card.count.mockResolvedValue(42)

		const { status, body } = await get(`${BASE}?page=2&pageSize=20`, { cookie })

		expect(status).toBe(200)
		expect(body.pagination).toEqual({
			page: 2,
			rowCount: 42,
			pageCount: 3,
			pageSize: 20
		})
	})

	it('traduz a página em skip', async () => {
		await get(`${BASE}?page=3&pageSize=5`, { cookie })

		expect(argsFindMany()).toMatchObject({ take: 5, skip: 10 })
	})

	it('usa 1/20 quando a query não informa', async () => {
		await get(BASE, { cookie })

		expect(argsFindMany()).toMatchObject({ take: 20, skip: 0 })
	})

	it('rejeita página zero ou negativa', async () => {
		const { status } = await get(`${BASE}?page=0`, { cookie })

		expect(status).toBe(400)
	})

	it('rejeita pageSize não numérico', async () => {
		const { status } = await get(`${BASE}?pageSize=muitos`, { cookie })

		expect(status).toBe(400)
	})
})

describe('GET /cards — busca e filtros', () => {
	it('term + fields viram OR no Prisma', async () => {
		await get(`${BASE}?term=relatorio&fields=title`, { cookie })

		expect(argsFindMany().where).toEqual({
			OR: [{ title: { contains: 'relatorio', mode: 'insensitive' } }]
		})
	})

	it('aceita fields repetido como lista', async () => {
		await get(`${BASE}?term=x&fields=title&fields=description`, { cookie })

		expect(argsFindMany().where.OR).toHaveLength(2)
	})

	it('fspecifics repetido vira AND', async () => {
		await get(`${BASE}?fspecifics=title$manual&fspecifics=description$anual`, {
			cookie
		})

		expect(argsFindMany().where).toEqual({
			AND: [
				{ title: { contains: 'manual', mode: 'insensitive' } },
				{ description: { contains: 'anual', mode: 'insensitive' } }
			]
		})
	})

	it('fspecifics com um valor só (string) normaliza pra array e filtra', async () => {
		await get(`${BASE}?fspecifics=title$manual`, { cookie })

		expect(argsFindMany().where).toEqual({
			AND: [{ title: { contains: 'manual', mode: 'insensitive' } }]
		})
	})

	it('aceita fields e fspecifics em notação bracket (fields[]=)', async () => {
		await get(
			`${BASE}?term=x&fields%5B%5D=title&fields%5B%5D=description&fspecifics%5B%5D=title%24manual`,
			{ cookie }
		)

		const where = argsFindMany().where
		expect(where.OR).toHaveLength(2)
		expect(where.AND).toEqual([
			{ title: { contains: 'manual', mode: 'insensitive' } }
		])
	})

	it('fspecifics fora do formato campo$valor é rejeitado na validação', async () => {
		const { status, body } = await get(`${BASE}?fspecifics=semseparador`, {
			cookie
		})

		expect(status).toBe(400)
		expect(body.details.errors[0].message).toContain('field$value')
	})

	it('ordena pelo campo pedido', async () => {
		await get(`${BASE}?order=title&orderDirection=desc`, { cookie })

		expect(argsFindMany().orderBy).toEqual({ title: 'desc' })
	})

	it('rejeita direção de ordenação inválida', async () => {
		const { status } = await get(`${BASE}?order=title&orderDirection=torta`, {
			cookie
		})

		expect(status).toBe(400)
	})
})

describe('GET /cards — select dinâmico', () => {
	it('é ignorado: o controller de cards não declara allowedFields', async () => {
		// Sem whitelist o select dinâmico é descartado de propósito — senão
		// qualquer coluna do modelo ficaria exposta pela querystring.
		await get(`${BASE}?select=id,title`, { cookie })

		expect(argsFindMany().select).toBeUndefined()
	})
})

describe('GET /cards/:id', () => {
	it('devolve o registro', async () => {
		const registro = card()
		prismaMock.Card.findUnique.mockResolvedValue(registro)

		const { status, body } = await get(`${BASE}/${registro.id}`, { cookie })

		expect(status).toBe(200)
		expect(body.id).toBe(registro.id)
	})

	it('404 quando não existe', async () => {
		prismaMock.Card.findUnique.mockResolvedValue(null)

		const { status, body } = await get(`${BASE}/${uuidV7()}`, { cookie })

		expect(status).toBe(404)
		expect(body.message).toBe('Registro não localizado.')
	})

	it('400 quando o id não é UUID', async () => {
		const { status, body } = await get(`${BASE}/nao-e-uuid`, { cookie })

		expect(status).toBe(400)
		expect(body.error).toBe('Erro de Validação')
		expect(body.details.errors[0].field).toBe('id')
	})
})

describe('POST /cards', () => {
	it('cria e responde 201', async () => {
		const registro = card({ title: 'Novo card' })
		prismaMock.Card.create.mockResolvedValue(registro)

		const { status, body } = await post(
			BASE,
			{ title: 'Novo card' },
			{ cookie }
		)

		expect(status).toBe(201)
		expect(body.title).toBe('Novo card')
	})

	it('400 sem título', async () => {
		const { status, body } = await post(
			BASE,
			{ description: 'só isso' },
			{ cookie }
		)

		expect(status).toBe(400)
		expect(body.details.errors.map(e => e.field)).toContain('title')
	})

	it('400 com título vazio', async () => {
		const { status } = await post(BASE, { title: '' }, { cookie })

		expect(status).toBe(400)
	})

	it('aceita description nula', async () => {
		prismaMock.Card.create.mockResolvedValue(card({ description: null }))

		const { status } = await post(
			BASE,
			{ title: 'x', description: null },
			{ cookie }
		)

		expect(status).toBe(201)
	})

	it('não deixa o cliente escolher o id', async () => {
		prismaMock.Card.create.mockResolvedValue(card())

		await post(BASE, { id: 'forjado', title: 'x' }, { cookie })

		expect(prismaMock.Card.create.mock.calls.at(-1)[0].data.id).toBeUndefined()
	})

	it('violação de unique vira 409', async () => {
		prismaMock.Card.create.mockRejectedValue(
			prismaError('P2002', { target: ['title'] })
		)

		const { status, body } = await post(BASE, { title: 'repetido' }, { cookie })

		expect(status).toBe(409)
		expect(body.error).toBe('Conflito de Dados')
	})

	it('corpo malformado vira 400', async () => {
		const { status, body } = await post(BASE, '{ invalido', { cookie })

		expect(status).toBe(400)
		expect(body.error).toBe('Erro de Parsing')
	})
})

describe('PUT /cards/:id', () => {
	it('atualiza e responde 200', async () => {
		const registro = card({ title: 'Editado' })
		prismaMock.Card.update.mockResolvedValue(registro)

		const { status, body } = await put(
			`${BASE}/${registro.id}`,
			{ title: 'Editado' },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.title).toBe('Editado')
	})

	it('usa o id da rota, não o do corpo', async () => {
		const registro = card()
		prismaMock.Card.update.mockResolvedValue(registro)

		await put(
			`${BASE}/${registro.id}`,
			{ id: uuidV7(), title: 'x' },
			{ cookie }
		)

		expect(prismaMock.Card.update.mock.calls.at(-1)[0].where).toEqual({
			id: registro.id
		})
	})

	it('registro inexistente no Prisma vira 404', async () => {
		prismaMock.Card.update.mockRejectedValue(prismaError('P2025'))

		const { status } = await put(
			`${BASE}/${uuidV7()}`,
			{ title: 'x' },
			{ cookie }
		)

		expect(status).toBe(404)
	})

	it('400 quando o id não é UUID', async () => {
		const { status } = await put(`${BASE}/abc`, { title: 'x' }, { cookie })

		expect(status).toBe(400)
	})
})

describe('DELETE /cards/:id', () => {
	it('responde 204 sem corpo', async () => {
		const registro = card()

		const { status, body } = await del(`${BASE}/${registro.id}`, { cookie })

		expect(status).toBe(204)
		expect(body).toBeNull()
	})

	it('apaga pelo id da rota', async () => {
		const registro = card()

		await del(`${BASE}/${registro.id}`, { cookie })

		expect(prismaMock.Card.delete).toHaveBeenCalledWith({
			where: { id: registro.id }
		})
	})

	it('registro inexistente vira 404', async () => {
		prismaMock.Card.delete.mockRejectedValue(prismaError('P2025'))

		const { status } = await del(`${BASE}/${uuidV7()}`, { cookie })

		expect(status).toBe(404)
	})
})
