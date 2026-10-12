import { describe, expect, it } from 'bun:test'
import { baseController } from 'src/controllers'
import { prismaMock } from '../helpers/prisma-mock'

const simples = () => baseController('Card')

/** Argumentos da última chamada de findMany no model Card. */
const argsFindMany = () => prismaMock.Card.findMany.mock.calls.at(-1)[0]
const argsCount = () => prismaMock.Card.count.mock.calls.at(-1)[0]

describe('baseController.all', () => {
	it('devolve os registros com a contagem total', async () => {
		prismaMock.Card.findMany.mockResolvedValue([{ id: '1' }])
		prismaMock.Card.count.mockResolvedValue(1)

		expect(await simples().all({ query: {} })).toEqual({
			data: [{ id: '1' }],
			rowCount: 1
		})
	})

	it('não pagina', async () => {
		await simples().all({ query: {} })

		expect(argsFindMany().take).toBeUndefined()
		expect(argsFindMany().skip).toBeUndefined()
	})

	it('conta e busca com o mesmo predicado', async () => {
		await simples().all({ query: { term: 'x', fields: ['title'] } })

		expect(argsCount().where).toEqual(argsFindMany().where)
	})
})

describe('baseController.fetch — paginação', () => {
	it('traduz page/pageSize em take/skip', async () => {
		await simples().fetch({ query: { page: 3, pageSize: 10 } })

		expect(argsFindMany()).toMatchObject({ take: 10, skip: 20 })
	})

	it('aceita page/pageSize como string', async () => {
		await simples().fetch({ query: { page: '2', pageSize: '5' } })

		expect(argsFindMany()).toMatchObject({ take: 5, skip: 5 })
	})

	it('usa 1/20 como padrão', async () => {
		await simples().fetch({ query: {} })

		expect(argsFindMany()).toMatchObject({ take: 20, skip: 0 })
	})

	it('calcula pageCount arredondando para cima', async () => {
		prismaMock.Card.count.mockResolvedValue(21)

		const { pagination } = await simples().fetch({ query: { pageSize: 10 } })

		expect(pagination).toEqual({
			page: 1,
			rowCount: 21,
			pageCount: 3,
			pageSize: 10
		})
	})

	it('mantém pageCount em 1 quando não há registros', async () => {
		prismaMock.Card.count.mockResolvedValue(0)

		const { pagination } = await simples().fetch({ query: {} })

		expect(pagination.pageCount).toBe(1)
	})
})

describe('baseController — filtro por termo', () => {
	it('monta um OR com os campos informados', async () => {
		await simples().all({ query: { term: 'relatório', fields: ['title'] } })

		expect(argsFindMany().where).toEqual({
			OR: [{ title: { contains: 'relatório', mode: 'insensitive' } }]
		})
	})

	it('combina vários campos no mesmo OR', async () => {
		await simples().all({
			query: { term: 'x', fields: ['title', 'description'] }
		})

		expect(argsFindMany().where.OR).toHaveLength(2)
	})

	it('ignora o termo quando nenhum campo é informado', async () => {
		await simples().all({ query: { term: 'x', fields: [] } })

		expect(argsFindMany().where).toEqual({})
	})

	it('sem termo, não filtra nada', async () => {
		await simples().all({ query: { fields: ['title'] } })

		expect(argsFindMany().where).toEqual({})
	})

	it('campo que não existe é recusado com 400', async () => {
		// Antes a chave crua seguia para o `where` e o Prisma estourava: 500 com
		// `Invalid prisma[model].count() invocation` e caminho de arquivo do
		// servidor na mensagem. Item 35 do plano de correção.
		const promessa = simples().all({
			query: { term: 'x', fields: ['nao_existe'] }
		})

		await expect(promessa).rejects.toMatchObject({ statusCode: 400 })
	})

	it('a mensagem do 400 nomeia o campo e não vaza texto do Prisma', async () => {
		try {
			await simples().all({ query: { term: 'x', fields: ['nao_existe'] } })
			throw new Error('deveria ter recusado')
		} catch (erro) {
			expect(erro.message).toContain('nao_existe')
			expect(erro.message).not.toContain('prisma')
		}
	})

	it('notação de relação (`user.email`) continua aceita', async () => {
		await baseController('UserRole').all({
			query: { term: 'x', fields: ['user.email'] }
		})

		expect(prismaMock.UserRole.findMany.mock.calls.at(-1)[0].where).toEqual({
			OR: [{ user: { email: { contains: 'x', mode: 'insensitive' } } }]
		})
	})

	it('notação de lista (`userRoles:roleId`) continua aceita', async () => {
		await baseController('User').all({
			query: { term: 'x', fields: ['userRoles:roleId'] }
		})

		expect(prismaMock.User.findMany.mock.calls.at(-1)[0].where).toEqual({
			OR: [
				{
					userRoles: {
						some: { roleId: { contains: 'x', mode: 'insensitive' } }
					}
				}
			]
		})
	})
})

describe('baseController — filtros específicos', () => {
	it('traduz campo$valor em AND', async () => {
		await simples().all({ query: { fspecifics: ['title$manual'] } })

		expect(argsFindMany().where).toEqual({
			AND: [{ title: { contains: 'manual', mode: 'insensitive' } }]
		})
	})

	it('acumula vários filtros no AND', async () => {
		await simples().all({
			query: { fspecifics: ['title$a', 'description$b'] }
		})

		expect(argsFindMany().where.AND).toHaveLength(2)
	})

	it('descarta entrada sem o separador', async () => {
		await simples().all({ query: { fspecifics: ['semseparador'] } })

		expect(argsFindMany().where).toEqual({})
	})

	it('combina termo e filtro específico', async () => {
		await simples().all({
			query: { term: 'x', fields: ['title'], fspecifics: ['description$y'] }
		})

		const { where } = argsFindMany()
		expect(where.OR).toHaveLength(1)
		expect(where.AND).toHaveLength(1)
	})

	it('campo que não existe no model é recusado com 400', async () => {
		// Antes o `where` seguia com a chave crua e o Prisma estourava: 500 com
		// `Invalid prisma[model].count() invocation` e caminho de arquivo do
		// servidor na mensagem.
		const promessa = simples().all({ query: { fspecifics: ['nao_existe$1'] } })

		await expect(promessa).rejects.toMatchObject({ statusCode: 400 })
	})

	it('a mensagem do 400 nomeia o campo e não vaza texto do Prisma', async () => {
		try {
			await simples().all({ query: { fspecifics: ['nao_existe$1'] } })
			throw new Error('deveria ter recusado')
		} catch (erro) {
			expect(erro.message).toContain('nao_existe')
			expect(erro.message).not.toContain('prisma')
		}
	})

	it('filtro do controller monta o predicado da relação', async () => {
		const controller = baseController('Card', {
			filtros: {
				estado_id: valor => ({ relacao: { estado_id: Number(valor) } })
			}
		})

		await controller.all({ query: { fspecifics: ['estado_id$=3'] } })

		expect(argsFindMany().where).toEqual({
			AND: [{ relacao: { estado_id: 3 } }]
		})
	})

	it('campo$=valor faz igualdade exata, não contains', async () => {
		// Sem isso, "status$=ativo" (queríamos igualdade) casaria por engano
		// com "inativo" via contains — "ativo" é substring de "inativo".
		await simples().all({ query: { fspecifics: ['title$=ativo'] } })

		expect(argsFindMany().where).toEqual({
			AND: [{ title: 'ativo' }]
		})
	})
})

describe('baseController — ordenação', () => {
	it('ordena ascendente por padrão', async () => {
		await simples().all({ query: { order: 'title' } })

		expect(argsFindMany().orderBy).toEqual({ title: 'asc' })
	})

	it('aceita descendente', async () => {
		await simples().all({ query: { order: 'title', orderDirection: 'desc' } })

		expect(argsFindMany().orderBy).toEqual({ title: 'desc' })
	})

	it('direção inválida cai em asc', async () => {
		await simples().all({
			query: { order: 'title', orderDirection: 'lateral' }
		})

		expect(argsFindMany().orderBy).toEqual({ title: 'asc' })
	})

	it('sem order, não manda orderBy para o Prisma', async () => {
		await simples().all({ query: {} })

		expect('orderBy' in argsFindMany()).toBe(false)
	})

	it.todo(
		'order em array deveria usar mapOrder — hoje `mapOrder` não existe em useUtils e a chamada quebra'
	)
})

describe('baseController — projeção de campos', () => {
	const comWhitelist = () =>
		baseController('Card', {
			allowedFields: ['id', 'title', 'description'],
			sensitiveFields: ['description'],
			omit: { description: true }
		})

	it('aplica só os campos permitidos', async () => {
		await comWhitelist().all({ query: { select: 'id,title' } })

		expect(argsFindMany().select).toEqual({ id: true, title: true })
	})

	it('descarta campo fora da whitelist', async () => {
		await comWhitelist().all({ query: { select: 'id,password_hash' } })

		expect(argsFindMany().select).toEqual({ id: true })
	})

	it('descarta campo marcado como sensível mesmo estando na whitelist', async () => {
		await comWhitelist().all({ query: { select: 'id,description' } })

		expect(argsFindMany().select).toEqual({ id: true })
	})

	it('ignora espaços e itens vazios', async () => {
		await comWhitelist().all({ query: { select: ' id , , title ' } })

		expect(argsFindMany().select).toEqual({ id: true, title: true })
	})

	it('quando nada sobra, volta para a projeção estática', async () => {
		await comWhitelist().all({ query: { select: 'inexistente' } })

		expect(argsFindMany().select).toBeUndefined()
		expect(argsFindMany().omit).toEqual({ description: true })
	})

	it('sem allowedFields, o select dinâmico é ignorado por segurança', async () => {
		const controller = baseController('Card', { omit: { description: true } })

		await controller.all({ query: { select: 'id' } })

		expect(argsFindMany().select).toBeUndefined()
		expect(argsFindMany().omit).toEqual({ description: true })
	})

	it('select dinâmico substitui include e omit (Prisma não aceita os dois)', async () => {
		const controller = baseController('Card', {
			allowedFields: ['id'],
			include: { qualquer: true },
			omit: { description: true }
		})

		await controller.all({ query: { select: 'id' } })

		const args = argsFindMany()
		expect(args.select).toEqual({ id: true })
		expect(args.include).toBeUndefined()
		expect(args.omit).toBeUndefined()
	})

	it('sem select dinâmico, usa include e omit estáticos', async () => {
		const controller = baseController('Card', {
			include: { qualquer: true },
			omit: { description: true }
		})

		await controller.all({ query: {} })

		expect(argsFindMany()).toMatchObject({
			include: { qualquer: true },
			omit: { description: true }
		})
	})
})

describe('baseController.one', () => {
	it('busca pelo id', async () => {
		prismaMock.Card.findUnique.mockResolvedValue({ id: 'abc' })

		const resultado = await simples().one({ params: { id: 'abc' }, query: {} })

		expect(prismaMock.Card.findUnique).toHaveBeenCalledWith({
			where: { id: 'abc' }
		})
		expect(resultado).toEqual({ id: 'abc' })
	})

	it('lança erro 404 quando não encontra', async () => {
		prismaMock.Card.findUnique.mockResolvedValue(null)

		expect(simples().one({ params: { id: 'x' }, query: {} })).rejects.toThrow(
			'Registro não localizado.'
		)
	})

	it('o erro carrega statusCode 404 para o handler global', async () => {
		prismaMock.Card.findUnique.mockResolvedValue(null)

		const erro = await simples()
			.one({ params: { id: 'x' }, query: {} })
			.catch(e => e)

		expect(erro.statusCode).toBe(404)
	})
})

describe('baseController.post', () => {
	it('cria e responde 201', async () => {
		prismaMock.Card.create.mockResolvedValue({ id: 'novo' })

		const resposta = await simples().post({
			body: { title: 'Novo' },
			query: {}
		})

		expect(resposta.code).toBe(201)
		expect(resposta.response).toEqual({ id: 'novo' })
	})

	it('descarta id vindo do cliente', async () => {
		await simples().post({
			body: { id: 'forjado', title: 'Novo' },
			query: {}
		})

		expect(prismaMock.Card.create.mock.calls[0][0].data).toEqual({
			title: 'Novo'
		})
	})
})

describe('baseController.put', () => {
	it('atualiza pelo id da rota, não pelo id do corpo', async () => {
		await simples().put({
			params: { id: 'real' },
			body: { id: 'forjado', title: 'Editado' },
			query: {}
		})

		expect(prismaMock.Card.update.mock.calls[0][0]).toMatchObject({
			where: { id: 'real' },
			data: { title: 'Editado' }
		})
	})
})

describe('baseController.del', () => {
	it('apaga e responde 204 sem corpo', async () => {
		const set = {}

		const resultado = await simples().del({ params: { id: 'abc' }, set })

		expect(prismaMock.Card.delete).toHaveBeenCalledWith({
			where: { id: 'abc' }
		})
		expect(set.status).toBe(204)
		expect(resultado).toBeNull()
	})
})
