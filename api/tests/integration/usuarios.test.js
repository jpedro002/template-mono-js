import { describe, expect, it } from 'bun:test'
import bcrypt from 'bcrypt'
import { del, get, post } from '../helpers/app'
import { IDS, loginAs, SENHA_PADRAO, userRecord } from '../helpers/auth'
import { uuidV7 } from '../helpers/factories'
import { prismaError, prismaMock } from '../helpers/prisma-mock'

const BASE = '/api/seguranca/usuarios'

const novoUsuario = (overrides = {}) => ({
	login: 'novo.usuario',
	email: 'Novo.Usuario@Teste.DEV',
	password: 'senha-forte-123',
	name: 'Novo Usuário',
	...overrides
})

describe('POST /usuarios — criação', () => {
	it('cria e responde 201', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })
		prismaMock.User.create.mockResolvedValue({ id: uuidV7() })

		const { status } = await post(BASE, novoUsuario(), { cookie })

		expect(status).toBe(201)
	})

	it('faz o hash da senha no servidor', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		await post(BASE, novoUsuario({ password: 'senha-forte-123' }), { cookie })

		const { data } = prismaMock.User.create.mock.calls.at(-1)[0]
		expect(data.password).toBeUndefined()
		expect(data.password_hash).toMatch(/^\$2[aby]\$/)
		expect(await bcrypt.compare('senha-forte-123', data.password_hash)).toBe(
			true
		)
	})

	it('normaliza o email para minúsculas sem espaços', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		await post(BASE, novoUsuario(), { cookie })

		expect(prismaMock.User.create.mock.calls.at(-1)[0].data.email).toBe(
			'novo.usuario@teste.dev'
		)
	})

	it('nunca devolve o hash da senha', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		await post(BASE, novoUsuario(), { cookie })

		expect(prismaMock.User.create.mock.calls.at(-1)[0].omit).toEqual({
			password_hash: true
		})
	})

	it('email com espaço sobrando é barrado na validação, antes do trim', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		const { status } = await post(
			BASE,
			novoUsuario({ email: 'com.espaco@teste.dev ' }),
			{ cookie }
		)

		// O `.trim()` do controller só roda depois — para espaços ele é inalcançável.
		expect(status).toBe(400)
	})

	it('senha curta é rejeitada', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		const { status, body } = await post(
			BASE,
			novoUsuario({ password: '1234' }),
			{ cookie }
		)

		expect(status).toBe(400)
		expect(body.details.errors.map(e => e.field)).toContain('password')
	})

	it('email inválido é rejeitado', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		const { status } = await post(BASE, novoUsuario({ email: 'nao-e-email' }), {
			cookie
		})

		expect(status).toBe(400)
	})

	it('campos obrigatórios ausentes são listados', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })

		const { status, body } = await post(BASE, { email: 'a@b.dev' }, { cookie })

		expect(status).toBe(400)
		const campos = body.details.errors.map(e => e.field)
		expect(campos).toContain('login')
		expect(campos).toContain('password')
		expect(campos).toContain('name')
	})

	it('email duplicado vira 409', async () => {
		const { cookie } = await loginAs({ permissions: ['users:create'] })
		prismaMock.User.create.mockRejectedValue(
			prismaError('P2002', { target: ['email'] })
		)

		const { status, body } = await post(BASE, novoUsuario(), { cookie })

		expect(status).toBe(409)
		expect(body.message).toContain('email')
	})
})

describe('GET /usuarios — projeção', () => {
	it('esconde o hash e traz as roles do usuário', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		await get(BASE, { cookie })

		const args = prismaMock.User.findMany.mock.calls.at(-1)[0]
		expect(args.omit).toEqual({ password_hash: true })
		expect(args.include.userRoles).toBeTruthy()
	})

	it('select dinâmico respeita a whitelist', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		await get(`${BASE}?select=email,name`, { cookie })

		expect(prismaMock.User.findMany.mock.calls.at(-1)[0].select).toEqual({
			email: true,
			name: true
		})
	})

	it('select dinâmico não alcança o hash da senha', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		await get(`${BASE}?select=id,password_hash`, { cookie })

		const args = prismaMock.User.findMany.mock.calls.at(-1)[0]
		expect(args.select).toEqual({ id: true })
		expect(args.select.password_hash).toBeUndefined()
	})

	it('select só com campo proibido volta para a projeção estática', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		await get(`${BASE}?select=password_hash`, { cookie })

		const args = prismaMock.User.findMany.mock.calls.at(-1)[0]
		expect(args.select).toBeUndefined()
		expect(args.omit).toEqual({ password_hash: true })
	})
})

describe('POST /usuarios/update-password', () => {
	const rota = `${BASE}/update-password`

	async function autenticado() {
		const { cookie, usuario } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			password_hash: usuario.password_hash
		})
		return { cookie, usuario }
	}

	it('troca a senha do próprio usuário', async () => {
		const { cookie } = await autenticado()

		const { status, body } = await post(
			rota,
			{ oldPassword: SENHA_PADRAO, newPassword: 'nova-senha-forte' },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body).toEqual({ success: true })
	})

	it('grava o hash da senha nova', async () => {
		const { cookie } = await autenticado()

		await post(
			rota,
			{ oldPassword: SENHA_PADRAO, newPassword: 'nova-senha-forte' },
			{ cookie }
		)

		const { data } = prismaMock.User.update.mock.calls.at(-1)[0]
		expect(await bcrypt.compare('nova-senha-forte', data.password_hash)).toBe(
			true
		)
	})

	it('opera sobre o id do token, não sobre um id do corpo', async () => {
		const { cookie, usuario } = await autenticado()

		await post(
			rota,
			{
				oldPassword: SENHA_PADRAO,
				newPassword: 'nova-senha-forte',
				id: IDS.outro
			},
			{ cookie }
		)

		expect(prismaMock.User.update.mock.calls.at(-1)[0].where).toEqual({
			id: usuario.id
		})
	})

	it('senha antiga errada responde 401', async () => {
		const { cookie } = await autenticado()

		const { status, body } = await post(
			rota,
			{ oldPassword: 'errada', newPassword: 'nova-senha-forte' },
			{ cookie }
		)

		expect(status).toBe(401)
		expect(body.error).toBe('Senha antiga incorreta')
	})

	it('usuário sumido responde 404', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(null)

		const { status } = await post(
			rota,
			{ oldPassword: SENHA_PADRAO, newPassword: 'nova-senha-forte' },
			{ cookie }
		)

		expect(status).toBe(404)
	})

	it('senha nova curta é rejeitada na validação', async () => {
		const { cookie } = await autenticado()

		const { status } = await post(
			rota,
			{ oldPassword: SENHA_PADRAO, newPassword: 'curta' },
			{ cookie }
		)

		expect(status).toBe(400)
	})

	it('exige só autenticação — não a permissão users:update', async () => {
		const { cookie } = await autenticado()

		const { status } = await post(
			rota,
			{ oldPassword: SENHA_PADRAO, newPassword: 'nova-senha-forte' },
			{ cookie }
		)

		expect(status).toBe(200)
	})
})

describe('POST /usuarios/:id/roles/:roleId', () => {
	const rota = (userId, roleId) => `${BASE}/${userId}/roles/${roleId}`

	it('atribui a role', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue({
			id: IDS.role,
			name: 'EDITOR',
			rolePermissions: []
		})

		const { status } = await post(rota(IDS.user, IDS.role), {}, { cookie })

		expect(status).toBe(200)
	})

	it('registra quem atribuiu a partir do token', async () => {
		const { cookie, usuario } = await loginAs({
			id: IDS.admin,
			permissions: ['users:update']
		})
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue({
			id: IDS.role,
			rolePermissions: []
		})

		await post(rota(IDS.user, IDS.role), {}, { cookie })

		expect(
			prismaMock.userRole.upsert.mock.calls.at(-1)[0].create
		).toMatchObject({
			userId: IDS.user,
			roleId: IDS.role,
			assignedBy: usuario.id
		})
	})

	it('aceita data de expiração', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue({
			id: IDS.role,
			rolePermissions: []
		})

		await post(
			rota(IDS.user, IDS.role),
			{ expiresAt: '2026-12-31T00:00:00.000Z' },
			{ cookie }
		)

		expect(
			prismaMock.userRole.upsert.mock.calls.at(-1)[0].create.expiresAt
		).toBeInstanceOf(Date)
	})

	it('usuário inexistente responde 404', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })
		prismaMock.User.findUnique.mockResolvedValue(null)

		const { status, body } = await post(
			rota(IDS.inexistente, IDS.role),
			{},
			{ cookie }
		)

		expect(status).toBe(404)
		expect(body.error).toBe('Usuário não encontrado')
	})

	it('role inexistente responde 404', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Role.findUnique.mockResolvedValue(null)

		const { status, body } = await post(
			rota(IDS.user, IDS.inexistente),
			{},
			{ cookie }
		)

		expect(status).toBe(404)
		expect(body.error).toBe('Role não encontrada')
	})

	it('id fora do formato UUID responde 400', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })

		const { status } = await post(rota('abc', IDS.role), {}, { cookie })

		expect(status).toBe(400)
	})

	it('sem users:update responde 403', async () => {
		const { cookie } = await loginAs({ permissions: ['users:read'] })

		const { status } = await post(rota(IDS.user, IDS.role), {}, { cookie })

		expect(status).toBe(403)
	})
})

describe('DELETE /usuarios/:id/roles/:roleId', () => {
	it('remove a role', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })

		const { status, body } = await del(
			`${BASE}/${IDS.user}/roles/${IDS.role}`,
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body).toEqual({ success: true })
		expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
			where: { userId_roleId: { userId: IDS.user, roleId: IDS.role } }
		})
	})
})

describe('permissões diretas por rota de usuário', () => {
	const conceder = (userId, permissionId) =>
		`${BASE}/${userId}/permissions/${permissionId}`

	it('concede a permissão', async () => {
		const { cookie } = await loginAs({
			permissions: ['users:update', 'cards:read']
		})
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Permission.findUnique.mockResolvedValue({
			id: IDS.permission,
			identifier: 'cards:read'
		})

		const { status } = await post(
			conceder(IDS.user, IDS.permission),
			{},
			{ cookie }
		)

		expect(status).toBe(200)
		expect(
			prismaMock.userPermission.upsert.mock.calls.at(-1)[0].create
		).toMatchObject({ userId: IDS.user, permissionId: IDS.permission })
	})

	it('permissão inexistente responde 404', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })
		prismaMock.User.findUnique.mockResolvedValue(await userRecord())
		prismaMock.Permission.findUnique.mockResolvedValue(null)

		const { status, body } = await post(
			conceder(IDS.user, IDS.inexistente),
			{},
			{ cookie }
		)

		expect(status).toBe(404)
		expect(body.error).toBe('Permissão não encontrada')
	})

	it('revoga a permissão', async () => {
		const { cookie } = await loginAs({ permissions: ['users:update'] })

		const { status, body } = await del(conceder(IDS.user, IDS.permission), {
			cookie
		})

		expect(status).toBe(200)
		expect(body).toEqual({ success: true })
		expect(prismaMock.userPermission.delete).toHaveBeenCalledWith({
			where: {
				userId_permissionId: {
					userId: IDS.user,
					permissionId: IDS.permission
				}
			}
		})
	})
})
