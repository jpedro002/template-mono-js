import { describe, expect, it } from 'bun:test'
import { authorizationService } from 'src/services'
import { del, get, post, put } from '../helpers/app'
import { IDS, loginAs } from '../helpers/auth'
import { card, uuidV7 } from '../helpers/factories'
import { prismaMock } from '../helpers/prisma-mock'

const CARDS = '/api/teste/cards'
const USUARIOS = '/api/seguranca/usuarios'

describe('sem autenticação', () => {
	const rotas = [
		['GET', `${CARDS}/all`],
		['GET', CARDS],
		['GET', `${CARDS}/${uuidV7()}`],
		['POST', CARDS],
		['PUT', `${CARDS}/${uuidV7()}`],
		['DELETE', `${CARDS}/${uuidV7()}`],
		['GET', USUARIOS]
	]

	for (const [metodo, rota] of rotas) {
		it(`${metodo} ${rota} responde 401`, async () => {
			const { status } = await get(rota, { method: metodo })

			expect(status).toBe(401)
		})
	}

	it('POST /usuarios/update-password com corpo válido responde 401', async () => {
		const { status } = await post(`${USUARIOS}/update-password`, {
			oldPassword: 'antiga',
			newPassword: 'nova-senha-123'
		})

		expect(status).toBe(401)
	})

	// A validação de schema roda antes do `beforeHandle`: um anônimo com corpo
	// inválido recebe 400 (e o formato esperado) em vez de 401.
	it('POST /usuarios/update-password com corpo inválido responde 400 antes de 401', async () => {
		const { status, body } = await post(`${USUARIOS}/update-password`, {})

		expect(status).toBe(400)
		expect(body.details.errors.map(e => e.field)).toContain('oldPassword')
	})

	it('a resposta 401 não diz se a rota ou o recurso existe', async () => {
		const { body } = await get(`${CARDS}/all`)

		expect(body).toMatchObject({
			error: 'Unauthorized',
			message: 'Token inválido ou expirado'
		})
	})
})

describe('autenticado sem permissão', () => {
	it('leitura de cards responde 403', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		const { status, body } = await get(`${CARDS}/all`, { cookie })

		expect(status).toBe(403)
		expect(body).toMatchObject({ error: 'Forbidden', statusCode: 403 })
		// O que faltou vai para o log, não para quem não tem acesso.
		expect(body.required).toBeUndefined()
	})

	it('criação responde 403 mesmo com permissão de leitura', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })

		const { status, body } = await post(CARDS, { title: 'x' }, { cookie })

		expect(status).toBe(403)
		expect(body.required).toBeUndefined()
	})

	it('exclusão responde 403 com permissão de atualização', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:update'] })

		const { status } = await del(`${CARDS}/${uuidV7()}`, { cookie })

		expect(status).toBe(403)
	})

	it('usuário sem permissão alguma é barrado', async () => {
		const { cookie } = await loginAs({ permissions: [] })

		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(403)
	})
})

describe('permissão exata libera cada verbo', () => {
	it('cards:read libera a listagem', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })

		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(200)
	})

	it('cards:create libera POST', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:create'] })
		prismaMock.Card.create.mockResolvedValue(card())

		expect((await post(CARDS, { title: 'x' }, { cookie })).status).toBe(201)
	})

	it('cards:update libera PUT', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:update'] })
		prismaMock.Card.update.mockResolvedValue(card())
		// A política de cards só deixa o dono editar.
		prismaMock.Card.findFirst.mockResolvedValue(card({ createdById: IDS.user }))

		expect(
			(await put(`${CARDS}/${uuidV7()}`, { title: 'x' }, { cookie })).status
		).toBe(200)
	})

	it('cards:delete libera DELETE', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:delete'] })
		prismaMock.Card.findFirst.mockResolvedValue(card({ createdById: IDS.user }))

		expect((await del(`${CARDS}/${uuidV7()}`, { cookie })).status).toBe(204)
	})
})

describe('wildcards', () => {
	it('cards:* cobre todos os verbos do recurso', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:*'] })
		prismaMock.Card.create.mockResolvedValue(card())

		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(200)
		expect((await post(CARDS, { title: 'x' }, { cookie })).status).toBe(201)
		expect((await del(`${CARDS}/${uuidV7()}`, { cookie })).status).toBe(204)
	})

	it('cards:* não vale para usuários', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:*'] })

		expect((await get(USUARIOS, { cookie })).status).toBe(403)
	})

	it('* libera qualquer recurso', async () => {
		const { cookie } = await loginAs({ permissions: ['*'] })

		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(200)
		expect((await get(USUARIOS, { cookie })).status).toBe(200)
	})

	it('*:read libera leitura em recursos diferentes', async () => {
		const { cookie } = await loginAs({ permissions: ['*:read'] })

		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(200)
	})

	it('*:read não alcança recursos de segurança', async () => {
		const { cookie } = await loginAs({ permissions: ['*:read'] })

		expect((await get(USUARIOS, { cookie })).status).toBe(403)
	})

	it('*:read não libera escrita', async () => {
		const { cookie } = await loginAs({ permissions: ['*:read'] })

		expect((await post(CARDS, { title: 'x' }, { cookie })).status).toBe(403)
	})
})

describe('permissões herdadas de role', () => {
	it('a permissão da role vale como se fosse direta', async () => {
		const { cookie } = await loginAs()
		prismaMock.userPermission.findMany.mockResolvedValue([])
		prismaMock.userRole.findMany.mockResolvedValue([
			{
				role: {
					name: 'EDITOR',
					active: true,
					rolePermissions: [
						{ permission: { identifier: 'cards:read', active: true } }
					]
				}
			}
		])
		authorizationService.clearCache()

		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(200)
	})

	it('a consulta exclui roles inativas e atribuições expiradas', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		authorizationService.clearCache()

		await get(`${CARDS}/all`, { cookie })

		const [args] = prismaMock.userRole.findMany.mock.calls.at(-1)
		expect(args.where.role).toEqual({ active: true })
		expect(args.where.OR).toEqual([
			{ expiresAt: null },
			{ expiresAt: { gt: expect.any(Date) } }
		])
	})
})

describe('cache de permissões entre requisições', () => {
	it('não reconsulta o banco a cada requisição', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })
		const antes = prismaMock.userPermission.findMany.mock.calls.length

		await get(`${CARDS}/all`, { cookie })
		await get(`${CARDS}/all`, { cookie })

		expect(prismaMock.userPermission.findMany.mock.calls.length).toBe(antes)
	})

	it('permissão revogada só passa a valer depois de limpar o cache', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })

		prismaMock.userPermission.findMany.mockResolvedValue([])
		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(200)

		authorizationService.clearCache()
		expect((await get(`${CARDS}/all`, { cookie })).status).toBe(403)
	})
})
