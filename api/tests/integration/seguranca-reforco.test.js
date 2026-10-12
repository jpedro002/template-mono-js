import { describe, expect, it } from 'bun:test'
import { acessoTotalService, sessaoService } from 'src/services'
import { del, get, post, put } from '../helpers/app'
import { IDS, loginAs, loginAsSuperAdmin } from '../helpers/auth'
import { card, uuidV7 } from '../helpers/factories'
import { prismaMock } from '../helpers/prisma-mock'

const PERFIL = '/api/seguranca/usuarios/perfil'
const USUARIOS = '/api/seguranca/usuarios'
const CARDS = '/api/teste/cards'
const AUDITORIA = '/api/seguranca/auditoria'

/** Troca o estado de sessão que o `jwtPlugin` lê e derruba o cache. */
async function estadoDaSessao(userId, estado) {
	prismaMock.User.findFirst.mockResolvedValue(estado)
	await sessaoService.invalidar(userId)
}

describe('sessão revogável', () => {
	it('token com versão defasada vira 401', async () => {
		const { cookie } = await loginAs()
		await estadoDaSessao(IDS.user, { active: true, tokenVersion: 1 })

		expect((await get(PERFIL, { cookie })).status).toBe(401)
	})

	it('usuário desativado perde a sessão já aberta', async () => {
		const { cookie } = await loginAs()
		await estadoDaSessao(IDS.user, { active: false, tokenVersion: 0 })

		expect((await get(PERFIL, { cookie })).status).toBe(401)
	})

	it('usuário excluído perde a sessão já aberta', async () => {
		const { cookie } = await loginAs()
		await estadoDaSessao(IDS.user, {
			active: true,
			deletedAt: new Date(),
			tokenVersion: 0
		})

		expect((await get(PERFIL, { cookie })).status).toBe(401)
	})

	it('requiresRelogin derruba a sessão até o próximo login', async () => {
		const { cookie } = await loginAs()
		await estadoDaSessao(IDS.user, {
			active: true,
			tokenVersion: 0,
			requiresRelogin: true
		})

		expect((await get(PERFIL, { cookie })).status).toBe(401)
	})

	it('o login limpa requiresRelogin e sobe a versão', async () => {
		prismaMock.User.update.mockResolvedValue({ tokenVersion: 3 })
		await loginAs({ requiresRelogin: true })

		const { data } = prismaMock.User.update.mock.calls.at(-1)[0]
		expect(data).toEqual({
			requiresRelogin: false,
			tokenVersion: { increment: 1 }
		})
	})

	it('POST /usuarios/:id/revogar-sessoes sobe a versão e audita', async () => {
		const { cookie } = await loginAsSuperAdmin()
		prismaMock.User.findUnique.mockResolvedValue({ id: IDS.outro })

		const { status } = await post(
			`${USUARIOS}/${IDS.outro}/revogar-sessoes`,
			undefined,
			{ cookie }
		)

		expect(status).toBe(204)
		expect(prismaMock.User.update.mock.calls.at(-1)[0]).toMatchObject({
			where: { id: IDS.outro },
			data: { tokenVersion: { increment: 1 } }
		})
		expect(
			prismaMock.authzAudit.create.mock.calls.at(-1)[0].data
		).toMatchObject({
			actorId: IDS.superAdmin,
			action: 'user.sessions.revoke',
			targetUserId: IDS.outro
		})
	})

	it('revogar-sessoes exige users:manage', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })

		const { status } = await post(
			`${USUARIOS}/${IDS.outro}/revogar-sessoes`,
			undefined,
			{ cookie }
		)

		expect(status).toBe(403)
	})
})

describe('desativar e excluir', () => {
	it('não desativa o próprio usuário', async () => {
		const { cookie } = await loginAsSuperAdmin()

		const { status } = await put(
			`${USUARIOS}/${IDS.superAdmin}`,
			{ active: false },
			{ cookie }
		)

		expect(status).toBe(409)
	})

	it('não exclui o próprio usuário', async () => {
		const { cookie } = await loginAsSuperAdmin()

		expect(
			(await del(`${USUARIOS}/${IDS.superAdmin}`, { cookie })).status
		).toBe(409)
	})

	it('desativar outro derruba as sessões dele e audita', async () => {
		const { cookie } = await loginAsSuperAdmin()
		prismaMock.User.update.mockResolvedValue({ id: IDS.outro })

		const { status } = await put(
			`${USUARIOS}/${IDS.outro}`,
			{ active: false },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(prismaMock.User.update.mock.calls.at(-1)[0].data).toMatchObject({
			active: false,
			tokenVersion: { increment: 1 }
		})
		expect(prismaMock.authzAudit.create.mock.calls.at(-1)[0].data.action).toBe(
			'user.deactivate'
		)
	})

	it('excluir outro grava deletedAt, sobe a versão e audita', async () => {
		const { cookie } = await loginAsSuperAdmin()

		const { status } = await del(`${USUARIOS}/${IDS.outro}`, { cookie })

		expect(status).toBe(204)
		expect(prismaMock.User.update.mock.calls.at(-1)[0].data).toMatchObject({
			active: false,
			tokenVersion: { increment: 1 }
		})
		expect(prismaMock.authzAudit.create.mock.calls.at(-1)[0].data.action).toBe(
			'user.delete'
		)
	})
})

describe('trava do último acesso total', () => {
	const umSuperAdmin = () => {
		prismaMock.userPermission.findMany.mockResolvedValue([])
		prismaMock.userRole.findMany.mockResolvedValue([
			{ userId: IDS.superAdmin, roleId: IDS.role }
		])
	}

	it('bloqueia tirar a role do único detentor de *', async () => {
		umSuperAdmin()

		await expect(
			acessoTotalService.semRoleDoUsuario(IDS.superAdmin, IDS.role)
		).rejects.toMatchObject({ statusCode: 409 })
	})

	it('bloqueia desativar o único detentor de *', async () => {
		umSuperAdmin()

		await expect(
			acessoTotalService.semUsuario(IDS.superAdmin)
		).rejects.toMatchObject({ statusCode: 409 })
	})

	it('bloqueia desligar a única role com *', async () => {
		umSuperAdmin()

		await expect(acessoTotalService.semRole(IDS.role)).rejects.toMatchObject({
			statusCode: 409
		})
	})

	it('libera quando sobra outro detentor', async () => {
		prismaMock.userPermission.findMany.mockResolvedValue([
			{ userId: IDS.admin, permissionId: IDS.permission }
		])
		prismaMock.userRole.findMany.mockResolvedValue([
			{ userId: IDS.superAdmin, roleId: IDS.role }
		])

		await acessoTotalService.semUsuario(IDS.superAdmin)
	})

	it('não trava base sem nenhum detentor (antes do seed)', async () => {
		await acessoTotalService.semUsuario(IDS.superAdmin)
	})
})

describe('política de cards (PBAC)', () => {
	it('POST grava o dono a partir da sessão, não do body', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:create'] })
		prismaMock.Card.create.mockResolvedValue(card())

		await post(CARDS, { title: 'x', createdById: IDS.outro }, { cookie })

		expect(prismaMock.Card.create.mock.calls.at(-1)[0].data.createdById).toBe(
			IDS.user
		)
	})

	it('dono edita', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:update'] })
		prismaMock.Card.findFirst.mockResolvedValue(card({ createdById: IDS.user }))
		prismaMock.Card.update.mockResolvedValue(card())

		expect(
			(await put(`${CARDS}/${uuidV7()}`, { title: 'x' }, { cookie })).status
		).toBe(200)
	})

	it('quem não é dono leva 403', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:update'] })
		prismaMock.Card.findFirst.mockResolvedValue(
			card({ createdById: IDS.outro })
		)

		expect(
			(await put(`${CARDS}/${uuidV7()}`, { title: 'x' }, { cookie })).status
		).toBe(403)
		expect(prismaMock.Card.update).not.toHaveBeenCalled()
	})

	it('card sem dono não é de todo mundo', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:delete'] })
		prismaMock.Card.findFirst.mockResolvedValue(card({ createdById: null }))

		expect((await del(`${CARDS}/${uuidV7()}`, { cookie })).status).toBe(403)
	})

	it('registro inexistente é 404 antes da regra', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:delete'] })
		prismaMock.Card.findFirst.mockResolvedValue(null)

		expect((await del(`${CARDS}/${uuidV7()}`, { cookie })).status).toBe(404)
	})

	it('cards:manage ignora a regra de dono', async () => {
		const { cookie } = await loginAs({
			permissions: ['cards:update', 'cards:manage']
		})
		prismaMock.Card.update.mockResolvedValue(card())

		expect(
			(await put(`${CARDS}/${uuidV7()}`, { title: 'x' }, { cookie })).status
		).toBe(200)
		expect(prismaMock.Card.findFirst).not.toHaveBeenCalled()
	})

	it('PUT não troca o dono pelo body', async () => {
		const { cookie } = await loginAs({ permissions: ['cards:update'] })
		prismaMock.Card.findFirst.mockResolvedValue(card({ createdById: IDS.user }))
		prismaMock.Card.update.mockResolvedValue(card())

		await put(
			`${CARDS}/${uuidV7()}`,
			{ title: 'x', createdById: IDS.outro },
			{ cookie }
		)

		expect(
			prismaMock.Card.update.mock.calls.at(-1)[0].data.createdById
		).toBeUndefined()
	})
})

describe('auditoria', () => {
	it('exige auditoria:read', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		expect((await get(AUDITORIA, { cookie })).status).toBe(403)
	})

	it('*:read não alcança a auditoria', async () => {
		const { cookie } = await loginAs({ permissions: ['*:read'] })

		expect((await get(AUDITORIA, { cookie })).status).toBe(403)
	})

	it('filtra por alvo, ação e período, mais recente primeiro', async () => {
		const { cookie } = await loginAs({ permissions: ['auditoria:read'] })

		const { status } = await get(
			`${AUDITORIA}?targetUserId=${IDS.outro}&action=role.assign&de=2026-01-01`,
			{ cookie }
		)

		expect(status).toBe(200)
		const [args] = prismaMock.authzAudit.findMany.mock.calls.at(-1)
		expect(args.where).toMatchObject({
			targetUserId: IDS.outro,
			action: 'role.assign'
		})
		expect(args.where.createdAt.gte).toBeInstanceOf(Date)
		expect(args.orderBy).toEqual({ createdAt: 'desc' })
	})

	it('conceder role grava na trilha na mesma transação', async () => {
		const { cookie } = await loginAsSuperAdmin()
		prismaMock.User.findUnique.mockResolvedValue({ id: IDS.outro })
		prismaMock.Role.findUnique.mockResolvedValue({ id: IDS.role, name: 'X' })
		prismaMock.userRole.upsert.mockResolvedValue({ assignedAt: new Date() })

		await post(`${USUARIOS}/${IDS.outro}/roles/${IDS.role}`, {}, { cookie })

		expect(prismaMock.$transaction).toHaveBeenCalled()
		expect(
			prismaMock.authzAudit.create.mock.calls.at(-1)[0].data
		).toMatchObject({
			actorId: IDS.superAdmin,
			action: 'role.assign',
			targetUserId: IDS.outro,
			roleId: IDS.role
		})
	})
})

describe('troca da própria senha', () => {
	it('derruba as outras sessões e renova o cookie desta', async () => {
		const { cookie, usuario } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(usuario)
		prismaMock.User.update.mockResolvedValue({ ...usuario, tokenVersion: 1 })

		const resposta = await post(
			`${USUARIOS}/update-password`,
			{ oldPassword: 'senha-de-teste-123', newPassword: 'outra-senha-123' },
			{ cookie }
		)

		expect(resposta.status).toBe(200)
		expect(
			prismaMock.User.update.mock.calls.at(-1)[0].data.tokenVersion
		).toEqual({ increment: 1 })
		expect(resposta.cookies.length).toBeGreaterThan(0)
	})
})
