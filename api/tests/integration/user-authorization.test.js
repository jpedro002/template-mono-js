import { describe, expect, it } from 'bun:test'
import { del, get, post } from '../helpers/app'
import { IDS, loginAs, userRecord } from '../helpers/auth'
import { prismaMock } from '../helpers/prisma-mock'

const BASE = '/api/seguranca/usuarios/users'

const PERMISSAO = {
	id: IDS.permission,
	identifier: 'cards:read',
	name: 'Visualizar Cards',
	category: 'cards'
}

describe('GET /users/:userId/permissions', () => {
	it('o usuário vê as próprias permissões sem users:manage', async () => {
		const { cookie, usuario } = await loginAs({ permissions: ['cards:read'] })

		const { status, body } = await get(`${BASE}/${usuario.id}/permissions`, {
			cookie
		})

		expect(status).toBe(200)
		expect(body).toEqual({ userId: usuario.id, permissions: ['cards:read'] })
	})

	it('não vê as de outro usuário sem users:manage', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:read'] })

		const { status, body } = await get(`${BASE}/${IDS.outro}/permissions`, {
			cookie
		})

		expect(status).toBe(403)
		expect(body.error).toBe('Acesso negado')
	})

	it('com users:manage vê as de qualquer um', async () => {
		const { cookie } = await loginAs({ permissions: ['users:manage'] })

		const { status, body } = await get(`${BASE}/${IDS.outro}/permissions`, {
			cookie
		})

		expect(status).toBe(200)
		expect(body.userId).toBe(IDS.outro)
	})

	it('exige autenticação', async () => {
		expect((await get(`${BASE}/${IDS.user}/permissions`)).status).toBe(401)
	})

	it('id fora do formato UUID responde 400', async () => {
		const { cookie } = await loginAs()

		expect((await get(`${BASE}/abc/permissions`, { cookie })).status).toBe(400)
	})
})

describe('GET /users/:userId/roles', () => {
	it('o usuário vê as próprias roles', async () => {
		const { cookie, usuario } = await loginAs({ roles: ['VIEWER'] })

		const { status, body } = await get(`${BASE}/${usuario.id}/roles`, {
			cookie
		})

		expect(status).toBe(200)
		expect(body).toEqual({ userId: usuario.id, roles: ['VIEWER'] })
	})

	it('não vê as de outro sem users:manage', async () => {
		const { cookie } = await loginAs({ roles: ['VIEWER'] })

		expect((await get(`${BASE}/${IDS.outro}/roles`, { cookie })).status).toBe(
			403
		)
	})

	it('com users:manage vê as de qualquer um', async () => {
		const { cookie } = await loginAs({
			permissions: ['users:manage'],
			roles: ['ADMIN']
		})

		expect((await get(`${BASE}/${IDS.outro}/roles`, { cookie })).status).toBe(
			200
		)
	})
})

describe('GET /users/:userId/permissions/detail', () => {
	function comDetalhes() {
		prismaMock.userPermission.findMany.mockResolvedValue([
			{
				permission: PERMISSAO,
				grantedAt: new Date('2026-01-01T00:00:00.000Z'),
				expiresAt: null,
				grantedBy: IDS.admin
			}
		])
		prismaMock.userRole.findMany.mockResolvedValue([
			{
				role: {
					id: IDS.role,
					name: 'EDITOR',
					rolePermissions: [{ permission: PERMISSAO }]
				}
			}
		])
	}

	it('separa permissões diretas das herdadas de role', async () => {
		const { cookie, usuario } = await loginAs()
		comDetalhes()

		const { status, body } = await get(
			`${BASE}/${usuario.id}/permissions/detail`,
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.directPermissions[0]).toMatchObject({
			identifier: 'cards:read',
			grantedBy: IDS.admin
		})
		expect(body.rolePermissions[0]).toMatchObject({
			roleName: 'EDITOR',
			roleId: IDS.role
		})
		expect(body.rolePermissions[0].permissions[0].identifier).toBe('cards:read')
	})

	it('ignora permissões diretas expiradas', async () => {
		const { cookie, usuario } = await loginAs()
		comDetalhes()

		await get(`${BASE}/${usuario.id}/permissions/detail`, { cookie })

		const [args] = prismaMock.userPermission.findMany.mock.calls.at(-1)
		expect(args.where.OR).toEqual([
			{ expiresAt: null },
			{ expiresAt: { gt: expect.any(Date) } }
		])
	})

	it('não expõe detalhes de outro usuário sem users:manage', async () => {
		const { cookie } = await loginAs()
		comDetalhes()

		const { status } = await get(`${BASE}/${IDS.outro}/permissions/detail`, {
			cookie
		})

		expect(status).toBe(403)
	})
})

describe('POST /users/permissions/grant', () => {
	const rota = `${BASE}/permissions/grant`

	async function autorizado() {
		return loginAs({
			id: IDS.admin,
			permissions: ['users:manage', 'permissions:assign', 'cards:read']
		})
	}

	it('concede e responde 201', async () => {
		const { cookie } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Permission.findUnique.mockResolvedValue(PERMISSAO)
		prismaMock.userPermission.upsert.mockResolvedValue({
			grantedAt: new Date('2026-01-01T00:00:00.000Z'),
			expiresAt: null
		})

		const { status, body } = await post(
			rota,
			{ userId: IDS.user, permissionId: IDS.permission },
			{ cookie }
		)

		expect(status).toBe(201)
		expect(body).toMatchObject({
			userId: IDS.user,
			permissionId: IDS.permission
		})
	})

	it('registra quem concedeu a partir do token', async () => {
		const { cookie, usuario } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Permission.findUnique.mockResolvedValue(PERMISSAO)
		prismaMock.userPermission.upsert.mockResolvedValue({
			grantedAt: new Date(),
			expiresAt: null
		})

		await post(
			rota,
			{ userId: IDS.user, permissionId: IDS.permission, grantedBy: IDS.outro },
			{ cookie }
		)

		expect(
			prismaMock.userPermission.upsert.mock.calls.at(-1)[0].create.grantedBy
		).toBe(usuario.id)
	})

	it('usuário inexistente responde 404', async () => {
		const { cookie } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(null)

		const { status, body } = await post(
			rota,
			{ userId: IDS.inexistente, permissionId: IDS.permission },
			{ cookie }
		)

		expect(status).toBe(404)
		expect(body.error).toBe('Usuário não encontrado')
	})

	it('permissão inexistente responde 404', async () => {
		const { cookie } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Permission.findUnique.mockResolvedValue(null)

		const { status, body } = await post(
			rota,
			{ userId: IDS.user, permissionId: IDS.inexistente },
			{ cookie }
		)

		expect(status).toBe(404)
		expect(body.error).toBe('Permissão não encontrada')
	})

	it('exige users:manage e permissions:assign juntas', async () => {
		const { cookie } = await loginAs({ permissions: ['users:manage'] })

		const { status } = await post(
			rota,
			{ userId: IDS.user, permissionId: IDS.permission },
			{ cookie }
		)

		expect(status).toBe(403)
	})

	it('corpo sem UUID válido responde 400', async () => {
		const { cookie } = await autorizado()

		const { status } = await post(
			rota,
			{ userId: 'abc', permissionId: IDS.permission },
			{ cookie }
		)

		expect(status).toBe(400)
	})
})

describe('DELETE /users/:userId/permissions/:permissionId', () => {
	it('revoga e responde 204', async () => {
		const { cookie } = await loginAs({
			permissions: ['users:manage', 'permissions:revoke']
		})

		const { status, body } = await del(
			`${BASE}/${IDS.user}/permissions/${IDS.permission}`,
			{ cookie }
		)

		expect(status).toBe(204)
		expect(body).toBeNull()
	})

	it('sem permissions:revoke responde 403', async () => {
		const { cookie } = await loginAs({ permissions: ['users:manage'] })

		const { status } = await del(
			`${BASE}/${IDS.user}/permissions/${IDS.permission}`,
			{ cookie }
		)

		expect(status).toBe(403)
	})
})

describe('POST /users/roles/assign', () => {
	const rota = `${BASE}/roles/assign`

	async function autorizado() {
		return loginAs({
			id: IDS.admin,
			permissions: ['users:manage', 'roles:assign']
		})
	}

	it('atribui e responde 201', async () => {
		const { cookie } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue({
			id: IDS.role,
			name: 'EDITOR',
			rolePermissions: []
		})
		prismaMock.userRole.upsert.mockResolvedValue({
			assignedAt: new Date('2026-01-01T00:00:00.000Z'),
			expiresAt: null
		})

		const { status, body } = await post(
			rota,
			{ userId: IDS.user, roleId: IDS.role },
			{ cookie }
		)

		expect(status).toBe(201)
		expect(body).toMatchObject({ userId: IDS.user, roleId: IDS.role })
	})

	it('converte expiresAt em Date', async () => {
		const { cookie } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue({
			id: IDS.role,
			rolePermissions: []
		})
		prismaMock.userRole.upsert.mockResolvedValue({
			assignedAt: new Date(),
			expiresAt: new Date('2026-12-31T00:00:00.000Z')
		})

		await post(
			rota,
			{
				userId: IDS.user,
				roleId: IDS.role,
				expiresAt: '2026-12-31T00:00:00.000Z'
			},
			{ cookie }
		)

		expect(
			prismaMock.userRole.upsert.mock.calls.at(-1)[0].create.expiresAt
		).toBeInstanceOf(Date)
	})

	it('role inexistente responde 404', async () => {
		const { cookie } = await autorizado()
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue(null)

		const { status, body } = await post(
			rota,
			{ userId: IDS.user, roleId: IDS.inexistente },
			{ cookie }
		)

		expect(status).toBe(404)
		expect(body.error).toBe('Role não encontrada')
	})

	it('expiresAt fora do ISO 8601 responde 400', async () => {
		const { cookie } = await autorizado()

		const { status } = await post(
			rota,
			{ userId: IDS.user, roleId: IDS.role, expiresAt: '31/12/2026' },
			{ cookie }
		)

		expect(status).toBe(400)
	})
})

describe('DELETE /users/:userId/roles/:roleId', () => {
	it('remove e responde 204', async () => {
		const { cookie } = await loginAs({
			permissions: ['users:manage', 'roles:revoke']
		})

		const { status } = await del(`${BASE}/${IDS.user}/roles/${IDS.role}`, {
			cookie
		})

		expect(status).toBe(204)
		expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
			where: { userId_roleId: { userId: IDS.user, roleId: IDS.role } }
		})
	})

	it('sem roles:revoke responde 403', async () => {
		const { cookie } = await loginAs({ permissions: ['users:manage'] })

		const { status } = await del(`${BASE}/${IDS.user}/roles/${IDS.role}`, {
			cookie
		})

		expect(status).toBe(403)
	})
})
