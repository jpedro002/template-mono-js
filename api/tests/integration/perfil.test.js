import { beforeEach, describe, expect, it } from 'bun:test'
import bcrypt from 'bcrypt'
import { get, post, put } from '../helpers/app'
import { loginAs, SENHA_PADRAO } from '../helpers/auth'
import { prismaMock } from '../helpers/prisma-mock'

const PERFIL = '/api/seguranca/usuarios/perfil'
const CHECK = '/api/seguranca/usuarios/check-password'
const TROCA_SENHA = '/api/seguranca/usuarios/update-password'

// Hash gravado pelo Laravel: mesmo bcrypt, marca de versão `$2y$`. É o formato
// de todos os 4 mil usuários migrados.
const hashLaravel = async senha =>
	(await bcrypt.hash(senha, 4)).replace(/^\$2[ab]\$/, '$2y$')

function usuarioSalvo(overrides = {}) {
	return {
		id: '01924f8a-0000-7000-8000-000000000003',
		name: 'Usuário de Teste',
		email: 'usuario@teste.dev',
		login: 'usuario',
		phone: null,
		emailVerifiedAt: null,
		...overrides
	}
}

beforeEach(() => {
	prismaMock.email_change_tokens.findFirst.mockResolvedValue(null)
})

describe(`GET ${PERFIL}`, () => {
	it('devolve os dados pessoais do usuário do token', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(usuarioSalvo())

		const { status, body } = await get(PERFIL, { cookie })

		expect(status).toBe(200)
		expect(body.email).toBe('usuario@teste.dev')
		expect(body.troca_email_pendente).toBeNull()

		// Sempre o id do token — nunca um id vindo do cliente.
		const consulta = prismaMock.User.findUnique.mock.calls.at(-1)[0]
		expect(consulta.where).toEqual({
			id: '01924f8a-0000-7000-8000-000000000003',
			deletedAt: null
		})
	})

	// Devolver a linha inteira de email_change_tokens exporia o
	// `token_hash` — a credencial de confirmação numa resposta de leitura.
	it('expõe a troca de e-mail pendente sem o token de confirmação', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(usuarioSalvo())
		prismaMock.email_change_tokens.findFirst.mockResolvedValue({
			new_email: 'novo@teste.dev',
			expires_at: new Date('2026-12-01T00:00:00.000Z')
		})

		const { body } = await get(PERFIL, { cookie })

		expect(body.troca_email_pendente.new_email).toBe('novo@teste.dev')

		const consulta =
			prismaMock.email_change_tokens.findFirst.mock.calls.at(-1)[0]
		expect(consulta.select).toEqual({ new_email: true, expires_at: true })
	})

	it('exige autenticação', async () => {
		expect((await get(PERFIL)).status).toBe(401)
	})
})

describe(`PUT ${PERFIL}`, () => {
	it('atualiza nome e telefone do próprio usuário', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.update.mockResolvedValue(
			usuarioSalvo({ name: 'Novo Nome', phone: '11999999999' })
		)

		const { status, body } = await put(
			PERFIL,
			{ name: 'Novo Nome', phone: '11999999999' },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.name).toBe('Novo Nome')

		const consulta = prismaMock.User.update.mock.calls.at(-1)[0]
		expect(consulta.where.id).toBe('01924f8a-0000-7000-8000-000000000003')
		expect(consulta.data).toEqual({ name: 'Novo Nome', phone: '11999999999' })
	})

	// Trocar senha por aqui deixaria uma sessão sequestrada virar troca de
	// senha sem provar a antiga.
	it('recusa senha e e-mail no corpo', async () => {
		const { cookie } = await loginAs()

		const { status } = await put(
			PERFIL,
			{ name: 'Novo Nome', password: 'senha-nova-123', email: 'x@y.dev' },
			{ cookie }
		)

		expect(status).toBe(400)
	})
})

describe(`POST ${CHECK}`, () => {
	it('confere a senha atual sem trocar nada', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			password_hash: await hashLaravel(SENHA_PADRAO)
		})
		prismaMock.User.update.mockClear()

		const { status, body } = await post(
			CHECK,
			{ password: SENHA_PADRAO },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.valida).toBe(true)
		expect(prismaMock.User.update).not.toHaveBeenCalled()
	})

	it('senha errada devolve 200 com valida:false, não 401', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			password_hash: await hashLaravel(SENHA_PADRAO)
		})

		const { status, body } = await post(
			CHECK,
			{ password: 'errada' },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.valida).toBe(false)
	})

	it('exige autenticação', async () => {
		expect((await post(CHECK, { password: 'x' })).status).toBe(401)
	})
})

describe(`POST ${TROCA_SENHA}`, () => {
	// Antes do helper compartilhado, o compare cru reprovava todo hash `$2y$` —
	// ou seja, os 4 mil usuários vindos do Laravel não trocavam a senha.
	it('aceita a senha antiga gravada pelo Laravel (prefixo $2y$)', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			password_hash: await hashLaravel(SENHA_PADRAO)
		})
		prismaMock.User.update.mockResolvedValue({})

		const { status, body } = await post(
			TROCA_SENHA,
			{ oldPassword: SENHA_PADRAO, newPassword: 'senha-nova-12345' },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.success).toBe(true)
	})

	it('senha antiga errada devolve 401', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			password_hash: await hashLaravel(SENHA_PADRAO)
		})

		const { status } = await post(
			TROCA_SENHA,
			{ oldPassword: 'errada', newPassword: 'senha-nova-12345' },
			{ cookie }
		)

		expect(status).toBe(401)
	})

	// Gestor/Pedagogo é 96% da base e não tem nenhuma permissão de `users:*`:
	// com a rota atrás de `users:update:password` ninguém trocava a própria senha.
	it('não exige permissão de gestão de usuários', async () => {
		const { cookie } = await loginAs({ permissions: [], roles: [] })
		prismaMock.User.findUnique.mockResolvedValue({
			password_hash: await hashLaravel(SENHA_PADRAO)
		})
		prismaMock.User.update.mockResolvedValue({})

		const { status } = await post(
			TROCA_SENHA,
			{ oldPassword: SENHA_PADRAO, newPassword: 'senha-nova-12345' },
			{ cookie }
		)

		expect(status).toBe(200)
	})
})
