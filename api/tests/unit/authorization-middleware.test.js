import { describe, expect, it } from 'bun:test'
import * as middleware from 'src/middleware'
import { authorizationService } from 'src/services'

const { authenticate, authorize } = middleware

import { prismaMock } from '../helpers/prisma-mock'

const USER = { id: '01924f8a-0000-7000-8000-000000000003' }

function comPermissoes(...identificadores) {
	prismaMock.userPermission.findMany.mockResolvedValue(
		identificadores.map(identifier => ({
			permission: { identifier, active: true }
		}))
	)
}

function comRoles(...nomes) {
	prismaMock.userRole.findMany.mockResolvedValue(
		nomes.map(name => ({ role: { name, active: true, rolePermissions: [] } }))
	)
}

describe('authenticate', () => {
	it('deixa passar quando há usuário resolvido', () => {
		expect(authenticate({ user: USER })).toBeUndefined()
	})

	it('barra com 401 quando não há usuário', () => {
		const resultado = authenticate({ user: null })

		expect(resultado.code).toBe(401)
		expect(resultado.response).toMatchObject({
			error: 'Unauthorized',
			statusCode: 401
		})
	})

	it('barra quando o payload não tem id', () => {
		expect(authenticate({ user: { email: 'a@b.dev' } }).code).toBe(401)
	})

	it('não vaza o motivo da falha na mensagem', () => {
		expect(authenticate({ user: null }).response.message).toBe(
			'Token inválido ou expirado'
		)
	})
})

describe('authorize', () => {
	it('libera quem tem a permissão exata', async () => {
		comPermissoes('cards:read')

		expect(await authorize('cards:read')({ user: USER })).toBeUndefined()
	})

	it('libera por wildcard de recurso', async () => {
		comPermissoes('cards:*')

		expect(await authorize('cards:delete')({ user: USER })).toBeUndefined()
	})

	it('nega com 403', async () => {
		comPermissoes('cards:read')

		const resultado = await authorize('users:delete')({ user: USER })

		expect(resultado.code).toBe(403)
		expect(resultado.response).toMatchObject({
			error: 'Forbidden',
			statusCode: 403
		})
	})

	it('exige autenticação antes da permissão', async () => {
		expect((await authorize('cards:read')({ user: null })).code).toBe(401)
	})

	it('com lista, basta uma permissão por padrão', async () => {
		comPermissoes('cards:update')

		expect(
			await authorize(['cards:read', 'cards:update'])({ user: USER })
		).toBeUndefined()
	})

	it('com requireAll, exige todas', async () => {
		comPermissoes('cards:update')

		const resultado = await authorize(['cards:read', 'cards:update'], {
			requireAll: true
		})({ user: USER })

		expect(resultado.code).toBe(403)
	})

	it('com requireAll e todas concedidas, libera', async () => {
		comPermissoes('cards:read', 'cards:update')

		expect(
			await authorize(['cards:read', 'cards:update'], { requireAll: true })({
				user: USER
			})
		).toBeUndefined()
	})

	it('aceita string ou array na mesma chamada', async () => {
		comPermissoes('cards:read')

		expect(await authorize('cards:read')({ user: USER })).toBeUndefined()
		expect(await authorize(['cards:read'])({ user: USER })).toBeUndefined()
	})
})

describe('sem atalho por nome de role', () => {
	it('requireAdmin e requireSuperAdmin não existem mais — acesso é permissão', () => {
		expect(middleware.requireAdmin).toBeUndefined()
		expect(middleware.requireSuperAdmin).toBeUndefined()
	})
})

describe('403 não revela o RBAC', () => {
	it('a resposta não lista as permissões exigidas; o log sim', async () => {
		comPermissoes('cards:read')
		const avisos = []
		const log = { warn: (msg, campos) => avisos.push({ msg, campos }) }

		const resultado = await authorize('cards:delete')({ user: USER, log })

		expect(resultado.code).toBe(403)
		expect(resultado.response.required).toBeUndefined()
		expect(avisos[0].campos.required).toEqual(['cards:delete'])
	})
})

describe('getUserRoles', () => {
	it('filtra usuário inativo ou excluído, como getUserPermissions', async () => {
		comRoles('ADMIN')

		await authorizationService.getUserRoles(USER.id)

		const [args] = prismaMock.userRole.findMany.mock.calls.at(-1)
		expect(args.where.user).toEqual({ active: true, deletedAt: null })
	})
})
