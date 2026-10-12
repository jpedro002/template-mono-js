import { describe, expect, it } from 'bun:test'
import { authorizationService } from 'src/services'
import { del, get, post, put } from '../helpers/app'
import { IDS, loginAs, userRecord } from '../helpers/auth'
import { uuidV7 } from '../helpers/factories'
import { prismaMock } from '../helpers/prisma-mock'

const ROLES = '/api/seguranca/roles'
const PERMISSOES = '/api/seguranca/permissoes'

const permissaoRegistro = (overrides = {}) => ({
	id: IDS.permission,
	identifier: 'cards:read',
	name: 'Visualizar Cards',
	description: null,
	category: 'cards',
	active: true,
	...overrides
})

const roleRegistro = (overrides = {}) => ({
	id: IDS.role,
	name: 'EDITOR',
	active: true,
	rolePermissions: [
		{
			permission: {
				id: IDS.permission,
				identifier: 'cards:read',
				name: 'Visualizar Cards'
			}
		}
	],
	...overrides
})

describe('POST /roles', () => {
	it('cria a role com as permissões associadas', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:create'] })
		prismaMock.Role.create.mockResolvedValue(roleRegistro())

		const { status, body } = await post(
			ROLES,
			{ name: 'EDITOR', permissionIds: [IDS.permission] },
			{ cookie }
		)

		expect(status).toBe(201)
		expect(body.name).toBe('EDITOR')
		expect(
			prismaMock.Role.create.mock.calls.at(-1)[0].data.rolePermissions
				.createMany.data
		).toEqual([{ permissionId: IDS.permission }])
	})

	it('aceita role sem permissões', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:create'] })
		prismaMock.Role.create.mockResolvedValue(
			roleRegistro({ rolePermissions: [] })
		)

		const { status } = await post(ROLES, { name: 'VIEWER' }, { cookie })

		expect(status).toBe(201)
	})

	it('limpa o cache de permissões de todo mundo', async () => {
		const { cookie, usuario } = await loginAs({ permissions: ['roles:create'] })
		prismaMock.Role.create.mockResolvedValue(roleRegistro())
		const antes = prismaMock.userPermission.findMany.mock.calls.length

		await post(ROLES, { name: 'EDITOR' }, { cookie })
		await authorizationService.getUserPermissions(usuario.id)

		expect(prismaMock.userPermission.findMany.mock.calls.length).toBe(antes + 1)
	})

	it('nome ausente é barrado na validação', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:create'] })

		const { status } = await post(ROLES, { permissionIds: [] }, { cookie })

		expect(status).toBe(400)
	})

	it('permissionIds fora do formato UUID é rejeitado', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:create'] })

		const { status } = await post(
			ROLES,
			{ name: 'EDITOR', permissionIds: ['abc'] },
			{ cookie }
		)

		expect(status).toBe(400)
	})

	it('sem roles:create responde 403', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })

		expect((await post(ROLES, { name: 'X' }, { cookie })).status).toBe(403)
	})
})

describe('PUT /roles/:id', () => {
	it('atualiza nome e status', async () => {
		const { cookie } = await loginAs({
			permissions: ['roles:update', 'cards:read']
		})
		prismaMock.Role.findUnique.mockResolvedValue(roleRegistro({ name: 'NOVO' }))

		const { status, body } = await put(
			`${ROLES}/${IDS.role}`,
			{ name: 'NOVO', active: false },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.name).toBe('NOVO')
		expect(prismaMock.Role.update.mock.calls.at(-1)[0].data).toMatchObject({
			name: 'NOVO',
			active: false
		})
	})

	it('troca o conjunto de permissões da role', async () => {
		const { cookie } = await loginAs({
			permissions: ['roles:update', 'cards:read']
		})
		prismaMock.Role.findUnique.mockResolvedValue(roleRegistro())
		const novaPermissao = uuidV7()

		await put(
			`${ROLES}/${IDS.role}`,
			{ permissionIds: [novaPermissao] },
			{ cookie }
		)

		expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledWith({
			where: { roleId: IDS.role }
		})
		expect(
			prismaMock.rolePermission.createMany.mock.calls.at(-1)[0].data
		).toEqual([{ roleId: IDS.role, permissionId: novaPermissao }])
	})

	it('lista vazia apaga as associações sem recriar', async () => {
		const { cookie } = await loginAs({
			permissions: ['roles:update', 'cards:read']
		})
		prismaMock.Role.findUnique.mockResolvedValue(
			roleRegistro({ rolePermissions: [] })
		)

		await put(`${ROLES}/${IDS.role}`, { permissionIds: [] }, { cookie })

		expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalled()
		expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled()
	})

	it('invalida o cache de quem tem a role', async () => {
		const { cookie, usuario } = await loginAs({
			permissions: ['roles:update', 'cards:read']
		})
		prismaMock.Role.findUnique.mockResolvedValue(roleRegistro())
		prismaMock.userRole.findMany.mockResolvedValue([{ userId: usuario.id }])
		const antes = prismaMock.userPermission.findMany.mock.calls.length

		await put(`${ROLES}/${IDS.role}`, { permissionIds: [] }, { cookie })
		// O controller consulta userRole com outra projeção; volta para a forma
		// que o authorizationService espera antes de reler as permissões.
		prismaMock.userRole.findMany.mockResolvedValue([])
		await authorizationService.getUserPermissions(usuario.id)

		expect(prismaMock.userPermission.findMany.mock.calls.length).toBe(antes + 1)
	})

	it('sem permissionIds não mexe nas associações', async () => {
		const { cookie } = await loginAs({
			permissions: ['roles:update', 'cards:read']
		})
		prismaMock.Role.findUnique.mockResolvedValue(roleRegistro())

		await put(`${ROLES}/${IDS.role}`, { name: 'SÓ O NOME' }, { cookie })

		expect(prismaMock.rolePermission.deleteMany).not.toHaveBeenCalled()
	})
})

describe('GET /roles', () => {
	it('lista com paginação e traz as permissões da role', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })
		prismaMock.Role.findMany.mockResolvedValue([roleRegistro()])
		prismaMock.Role.count.mockResolvedValue(1)

		const { status, body } = await get(ROLES, { cookie })

		expect(status).toBe(200)
		expect(body.data[0].rolePermissions[0].permission.identifier).toBe(
			'cards:read'
		)
	})

	it('busca por id', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })
		prismaMock.Role.findUnique.mockResolvedValue(roleRegistro())

		const { status, body } = await get(`${ROLES}/${IDS.role}`, { cookie })

		expect(status).toBe(200)
		expect(body.id).toBe(IDS.role)
	})

	it('id inexistente responde 404', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })
		prismaMock.Role.findUnique.mockResolvedValue(null)

		expect((await get(`${ROLES}/${uuidV7()}`, { cookie })).status).toBe(404)
	})

	it('exclui a role', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:delete'] })

		const { status } = await del(`${ROLES}/${IDS.role}`, { cookie })

		expect(status).toBe(204)
	})
})

describe('GET /roles/:id/users', () => {
	it('lista os usuários que têm a role', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })
		const usuario = await userRecord()
		prismaMock.userRole.findMany.mockResolvedValue([
			{
				user: {
					id: usuario.id,
					email: usuario.email,
					login: usuario.login,
					name: usuario.name,
					active: true
				}
			}
		])

		const { status, body } = await get(`${ROLES}/${IDS.role}/users`, { cookie })

		expect(status).toBe(200)
		expect(body[0]).toMatchObject({ id: usuario.id, email: usuario.email })
	})

	it('não devolve o hash da senha', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })
		prismaMock.userRole.findMany.mockResolvedValue([])

		await get(`${ROLES}/${IDS.role}/users`, { cookie })

		const [args] = prismaMock.userRole.findMany.mock.calls.at(-1)
		expect(args.select.user.select.password_hash).toBeUndefined()
	})

	it('role sem usuários devolve lista vazia', async () => {
		const { cookie } = await loginAs({ permissions: ['roles:read'] })
		prismaMock.userRole.findMany.mockResolvedValue([])

		const { status, body } = await get(`${ROLES}/${IDS.role}/users`, { cookie })

		expect(status).toBe(200)
		expect(body).toEqual([])
	})

	it('sem roles:read responde 403', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		expect((await get(`${ROLES}/${IDS.role}/users`, { cookie })).status).toBe(
			403
		)
	})
})

describe('POST /permissoes', () => {
	it('cria a permissão', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:create'] })
		prismaMock.Permission.create.mockResolvedValue(permissaoRegistro())

		const { status, body } = await post(
			PERMISSOES,
			{
				identifier: 'cards:read',
				name: 'Visualizar Cards',
				category: 'cards'
			},
			{ cookie }
		)

		expect(status).toBe(201)
		expect(body.identifier).toBe('cards:read')
	})

	it('recusa identificador sem o padrão recurso:ação', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:create'] })

		const { status, body } = await post(
			PERMISSOES,
			{ identifier: 'cardsread', name: 'X', category: 'cards' },
			{ cookie }
		)

		expect(status).toBe(400)
		expect(body.error).toBe('Identificador inválido')
	})

	it('limpa todo o cache de permissões', async () => {
		const { cookie, usuario } = await loginAs({
			permissions: ['permissions:create']
		})
		prismaMock.Permission.create.mockResolvedValue(permissaoRegistro())
		const antes = prismaMock.userPermission.findMany.mock.calls.length

		await post(
			PERMISSOES,
			{ identifier: 'cards:read', name: 'X', category: 'cards' },
			{ cookie }
		)
		await authorizationService.getUserPermissions(usuario.id)

		expect(prismaMock.userPermission.findMany.mock.calls.length).toBe(antes + 1)
	})

	it('identificador duplicado vira 409', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:create'] })
		const { prismaError } = await import('../helpers/prisma-mock')
		prismaMock.Permission.create.mockRejectedValue(
			prismaError('P2002', { target: ['identifier'] })
		)

		const { status } = await post(
			PERMISSOES,
			{ identifier: 'cards:read', name: 'X', category: 'cards' },
			{ cookie }
		)

		expect(status).toBe(409)
	})
})

describe('GET /permissoes', () => {
	it('lista com paginação', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:read'] })
		prismaMock.Permission.findMany.mockResolvedValue([permissaoRegistro()])
		prismaMock.Permission.count.mockResolvedValue(1)

		const { status, body } = await get(PERMISSOES, { cookie })

		expect(status).toBe(200)
		expect(body.data).toHaveLength(1)
	})

	it('projeta só os campos declarados no controller', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:read'] })

		await get(PERMISSOES, { cookie })

		expect(
			Object.keys(prismaMock.Permission.findMany.mock.calls.at(-1)[0].select)
		).toEqual(['id', 'identifier', 'name', 'description', 'category', 'active'])
	})

	it('atualiza a permissão', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:update'] })
		prismaMock.Permission.findUnique.mockResolvedValue(permissaoRegistro())
		prismaMock.Permission.update.mockResolvedValue(
			permissaoRegistro({ name: 'Novo nome' })
		)

		const { status, body } = await put(
			`${PERMISSOES}/${IDS.permission}`,
			{ name: 'Novo nome' },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.name).toBe('Novo nome')
	})

	it('não deixa renomear o identificador — nem para `*`', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:update'] })
		prismaMock.Permission.findUnique.mockResolvedValue(permissaoRegistro())

		const { status } = await put(
			`${PERMISSOES}/${IDS.permission}`,
			{ identifier: '*' },
			{ cookie }
		)

		expect(status).toBe(422)
		expect(prismaMock.Permission.update).not.toHaveBeenCalled()
	})

	it('não cria permissão coringa', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:create'] })

		for (const identifier of ['*', 'users:*', '*:read']) {
			const { status } = await post(
				PERMISSOES,
				{ identifier, name: 'x', category: 'x' },
				{ cookie }
			)
			expect(status).toBe(400)
		}
		expect(prismaMock.Permission.create).not.toHaveBeenCalled()
	})

	it('exclui a permissão', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:delete'] })

		expect(
			(await del(`${PERMISSOES}/${IDS.permission}`, { cookie })).status
		).toBe(204)
	})
})

describe('GET /permissoes/category/:category', () => {
	it('filtra por categoria e só traz as ativas', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:read'] })
		prismaMock.Permission.findMany.mockResolvedValue([permissaoRegistro()])

		const { status, body } = await get(`${PERMISSOES}/category/cards`, {
			cookie
		})

		expect(status).toBe(200)
		expect(body).toHaveLength(1)
		expect(prismaMock.Permission.findMany.mock.calls.at(-1)[0].where).toEqual({
			category: 'cards',
			active: true
		})
	})

	it('exige permissions:read, como a listagem', async () => {
		const { cookie } = await loginAs({ permissions: [] })
		prismaMock.Permission.findMany.mockResolvedValue([])

		expect((await get(`${PERMISSOES}/category/cards`, { cookie })).status).toBe(
			403
		)
	})

	it('sem sessão responde 401', async () => {
		expect((await get(`${PERMISSOES}/category/cards`)).status).toBe(401)
	})

	it('categoria sem permissões devolve lista vazia', async () => {
		const { cookie } = await loginAs({ permissions: ['permissions:read'] })
		prismaMock.Permission.findMany.mockResolvedValue([])

		const { body } = await get(`${PERMISSOES}/category/inexistente`, { cookie })

		expect(body).toEqual([])
	})
})
