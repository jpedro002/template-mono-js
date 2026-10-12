import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	setSystemTime
} from 'bun:test'
import { PERMISSOES_SO_EXPLICITAS } from 'src/helpers/_permissoes-explicitas'
import { authorizationService } from 'src/services'
import { prismaMock } from '../helpers/prisma-mock'

const USER = '01924f8a-0000-7000-8000-000000000003'

function permissoesDiretas(...identificadores) {
	prismaMock.userPermission.findMany.mockResolvedValue(
		identificadores.map(identifier => ({
			permission: { identifier, active: true }
		}))
	)
}

function papeis(...definicoes) {
	prismaMock.userRole.findMany.mockResolvedValue(
		definicoes.map(({ name, permissions = [], active = true }) => ({
			role: {
				name,
				active,
				rolePermissions: permissions.map(identifier => ({
					permission: { identifier, active: true }
				}))
			}
		}))
	)
}

afterEach(() => {
	setSystemTime()
})

describe('getUserPermissions — compilação', () => {
	it('junta permissões diretas e as vindas de roles', async () => {
		permissoesDiretas('cards:read')
		papeis({ name: 'EDITOR', permissions: ['cards:update'] })

		expect(await authorizationService.getUserPermissions(USER)).toEqual([
			'cards:read',
			'cards:update'
		])
	})

	it('remove duplicatas', async () => {
		permissoesDiretas('cards:read')
		papeis({ name: 'A', permissions: ['cards:read'] })

		expect(await authorizationService.getUserPermissions(USER)).toEqual([
			'cards:read'
		])
	})

	it('descarta permissão direta inativa', async () => {
		prismaMock.userPermission.findMany.mockResolvedValue([
			{ permission: { identifier: 'cards:read', active: true } },
			{ permission: { identifier: 'cards:delete', active: false } }
		])

		expect(await authorizationService.getUserPermissions(USER)).toEqual([
			'cards:read'
		])
	})

	it('descarta permissão inativa dentro de uma role', async () => {
		prismaMock.userRole.findMany.mockResolvedValue([
			{
				role: {
					name: 'EDITOR',
					active: true,
					rolePermissions: [
						{ permission: { identifier: 'cards:update', active: true } },
						{ permission: { identifier: 'cards:delete', active: false } }
					]
				}
			}
		])

		expect(await authorizationService.getUserPermissions(USER)).toEqual([
			'cards:update'
		])
	})

	it('o wildcard total engole as demais permissões', async () => {
		permissoesDiretas('*', 'cards:read', 'users:read')

		expect(await authorizationService.getUserPermissions(USER)).toEqual(['*'])
	})

	it('devolve lista vazia quando não há nada concedido', async () => {
		expect(await authorizationService.getUserPermissions(USER)).toEqual([])
	})
})

describe('getUserPermissions — filtros enviados ao banco', () => {
	it('ignora concessões expiradas', async () => {
		await authorizationService.getUserPermissions(USER)

		const [args] = prismaMock.userPermission.findMany.mock.calls[0]
		expect(args.where.userId).toBe(USER)
		expect(args.where.OR).toEqual([
			{ expiresAt: null },
			{ expiresAt: { gt: expect.any(Date) } }
		])
	})

	it('ignora roles inativas e atribuições expiradas', async () => {
		await authorizationService.getUserPermissions(USER)

		const [args] = prismaMock.userRole.findMany.mock.calls[0]
		expect(args.where.role).toEqual({ active: true })
		expect(args.where.OR).toEqual([
			{ expiresAt: null },
			{ expiresAt: { gt: expect.any(Date) } }
		])
	})
})

describe('getUserPermissions — cache', () => {
	it('não consulta o banco na segunda chamada', async () => {
		permissoesDiretas('cards:read')

		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions(USER)

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(1)
	})

	it('forceRefresh ignora o cache', async () => {
		permissoesDiretas('cards:read')

		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions(USER, true)

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(2)
	})

	it('cada usuário tem sua própria entrada', async () => {
		permissoesDiretas('cards:read')

		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions('outro-usuario')

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(2)
	})

	it('expira depois de 5 minutos', async () => {
		const agora = new Date('2026-08-17T12:00:00.000Z')
		setSystemTime(agora)
		permissoesDiretas('cards:read')

		await authorizationService.getUserPermissions(USER)
		setSystemTime(new Date(agora.getTime() + 5 * 60 * 1000 + 1))
		await authorizationService.getUserPermissions(USER)

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(2)
	})

	it('sobrevive dentro da janela de 5 minutos', async () => {
		const agora = new Date('2026-08-17T12:00:00.000Z')
		setSystemTime(agora)
		permissoesDiretas('cards:read')

		await authorizationService.getUserPermissions(USER)
		setSystemTime(new Date(agora.getTime() + 4 * 60 * 1000))
		await authorizationService.getUserPermissions(USER)

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(1)
	})

	it('clearCache(userId) derruba só aquele usuário', async () => {
		permissoesDiretas('cards:read')
		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions('outro')

		authorizationService.clearCache(USER)
		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions('outro')

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(3)
	})

	it('clearCache() sem argumento derruba todos', async () => {
		permissoesDiretas('cards:read')
		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions('outro')

		authorizationService.clearCache()
		await authorizationService.getUserPermissions(USER)

		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(3)
	})
})

describe('getUserRoles', () => {
	it('devolve os nomes das roles ativas', async () => {
		papeis({ name: 'ADMIN' }, { name: 'EDITOR' })

		expect(await authorizationService.getUserRoles(USER)).toEqual([
			'ADMIN',
			'EDITOR'
		])
	})

	it('não usa cache — sempre consulta o banco', async () => {
		papeis({ name: 'ADMIN' })

		await authorizationService.getUserRoles(USER)
		await authorizationService.getUserRoles(USER)

		expect(prismaMock.userRole.findMany).toHaveBeenCalledTimes(2)
	})
})

describe('checkPermissionMatch', () => {
	// O template não declara nenhuma permissão só-explícita: registra uma aqui.
	beforeAll(() => {
		PERMISSOES_SO_EXPLICITAS.push('prototipo:read')
	})
	afterAll(() => {
		PERMISSOES_SO_EXPLICITAS.splice(
			PERMISSOES_SO_EXPLICITAS.indexOf('prototipo:read'),
			1
		)
	})

	const casos = [
		['exata', 'cards:read', ['cards:read'], true],
		['wildcard total', 'qualquer:coisa', ['*'], true],
		['wildcard de recurso', 'cards:delete', ['cards:*'], true],
		['wildcard de ação', 'cards:read', ['*:read'], true],
		[
			'*:acao não alcança recurso de segurança',
			'users:read',
			['*:read'],
			false
		],
		['recurso de segurança nomeado', 'users:read', ['users:*'], true],
		['recurso diferente', 'users:read', ['cards:*'], false],
		['ação diferente', 'cards:delete', ['*:read'], false],
		['sem permissão alguma', 'cards:read', [], false],
		['requerida sem ação', 'cards', ['cards:*'], false],
		['requerida vazia', '', ['*:read'], false],
		['só-explícita contra *', 'prototipo:read', ['*'], false],
		['só-explícita contra recurso:*', 'prototipo:read', ['prototipo:*'], false],
		['só-explícita contra *:read', 'prototipo:read', ['*:read'], false],
		['só-explícita exata', 'prototipo:read', ['*', 'prototipo:read'], true]
	]

	for (const [titulo, requerida, concedidas, esperado] of casos) {
		it(`${titulo}: ${requerida || '(vazia)'} contra [${concedidas}] = ${esperado}`, () => {
			expect(
				authorizationService.checkPermissionMatch(requerida, concedidas)
			).toBe(esperado)
		})
	}
})

describe('hasPermission', () => {
	it('resolve pelo conjunto compilado do usuário', async () => {
		permissoesDiretas('cards:*')

		expect(await authorizationService.hasPermission(USER, 'cards:delete')).toBe(
			true
		)
	})

	it('nega o que não bate', async () => {
		permissoesDiretas('cards:read')

		expect(await authorizationService.hasPermission(USER, 'users:delete')).toBe(
			false
		)
	})
})

describe('mutações invalidam o cache', () => {
	async function aquecerCache() {
		permissoesDiretas('cards:read')
		await authorizationService.getUserPermissions(USER)
	}

	it('grantPermissionToUser faz upsert e invalida', async () => {
		await aquecerCache()

		await authorizationService.grantPermissionToUser(USER, 'perm-1', 'admin-1')

		const [args] = prismaMock.userPermission.upsert.mock.calls[0]
		expect(args.where).toEqual({
			userId_permissionId: { userId: USER, permissionId: 'perm-1' }
		})
		expect(args.create).toMatchObject({ grantedBy: 'admin-1', expiresAt: null })

		await authorizationService.getUserPermissions(USER)
		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(2)
	})

	it('revokePermissionFromUser apaga e invalida', async () => {
		await aquecerCache()

		await authorizationService.revokePermissionFromUser(USER, 'perm-1', 'admin')

		expect(prismaMock.userPermission.delete).toHaveBeenCalledWith({
			where: { userId_permissionId: { userId: USER, permissionId: 'perm-1' } }
		})

		await authorizationService.getUserPermissions(USER)
		// aquecer + trava de acesso total + releitura depois da invalidação
		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(3)
	})

	it('assignRoleToUser faz upsert e invalida', async () => {
		await aquecerCache()
		const expira = new Date('2026-12-31T00:00:00.000Z')

		await authorizationService.assignRoleToUser(USER, 'role-1', 'admin', expira)

		const [args] = prismaMock.userRole.upsert.mock.calls[0]
		expect(args.where).toEqual({
			userId_roleId: { userId: USER, roleId: 'role-1' }
		})
		expect(args.create.expiresAt).toBe(expira)

		await authorizationService.getUserPermissions(USER)
		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(2)
	})

	it('removeRoleFromUser apaga e invalida', async () => {
		await aquecerCache()

		await authorizationService.removeRoleFromUser(USER, 'role-1', 'admin')

		expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
			where: { userId_roleId: { userId: USER, roleId: 'role-1' } }
		})

		await authorizationService.getUserPermissions(USER)
		// aquecer + trava de acesso total + releitura depois da invalidação
		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(3)
	})

	it('createPermission limpa o cache de todo mundo', async () => {
		await aquecerCache()
		await authorizationService.getUserPermissions('outro')

		await authorizationService.createPermission({ identifier: 'x:y' })

		await authorizationService.getUserPermissions(USER)
		await authorizationService.getUserPermissions('outro')
		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(4)
	})

	it('createRole cria com as permissões e limpa o cache', async () => {
		await aquecerCache()

		await authorizationService.createRole('EDITOR', 'desc', ['p1', 'p2'])

		const [args] = prismaMock.Role.create.mock.calls[0]
		expect(args.data.name).toBe('EDITOR')
		expect(args.data.rolePermissions.createMany.data).toEqual([
			{ permissionId: 'p1' },
			{ permissionId: 'p2' }
		])

		await authorizationService.getUserPermissions(USER)
		expect(prismaMock.userPermission.findMany).toHaveBeenCalledTimes(2)
	})
})
