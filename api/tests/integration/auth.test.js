import { describe, expect, it } from 'bun:test'
import { del, get, parseSetCookie, post } from '../helpers/app'
import {
	avancarJanelaDeLogin,
	grantRbac,
	IDS,
	loginAs,
	SENHA_PADRAO,
	userRecord
} from '../helpers/auth'
import { prismaMock } from '../helpers/prisma-mock'

const ROTA = '/api/seguranca/auth/session'

async function comUsuario(overrides = {}) {
	const usuario = await userRecord(overrides)
	prismaMock.User.findFirst.mockResolvedValue(usuario)
	grantRbac({ permissions: ['cards:read'], roles: ['VIEWER'] })
	avancarJanelaDeLogin()
	return usuario
}

describe('POST /auth/session — login bem-sucedido', () => {
	it('responde 200 com o usuário, roles e permissões', async () => {
		const usuario = await comUsuario()

		const { status, body } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})

		expect(status).toBe(200)
		expect(body.user).toMatchObject({
			id: usuario.id,
			email: usuario.email,
			login: usuario.login,
			roles: ['VIEWER'],
			permissions: ['cards:read']
		})
	})

	it('não devolve o token no corpo', async () => {
		const usuario = await comUsuario()

		const { body } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})

		expect(JSON.stringify(body)).not.toContain('eyJ')
		expect(body.token).toBeUndefined()
		expect(body.user.token).toBeUndefined()
	})

	it('não devolve o hash da senha', async () => {
		const usuario = await comUsuario()

		const { body } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})

		expect(JSON.stringify(body)).not.toContain('$2b$')
	})

	it('grava o JWT em cookie httpOnly', async () => {
		const usuario = await comUsuario()

		const { cookies } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})
		const cookie = parseSetCookie(cookies[0])

		expect(cookie.name).toBe('access_token')
		expect(cookie.value.split('.')).toHaveLength(3)
		expect(cookie.httponly).toBe(true)
	})

	it('o cookie carrega path, sameSite e max-age', async () => {
		const usuario = await comUsuario()

		const { cookies } = await post(ROTA, {
			email: usuario.email,
			password: SENHA_PADRAO
		})
		const cookie = parseSetCookie(cookies[0])

		expect(cookie.path).toBe('/')
		expect(String(cookie.samesite).toLowerCase()).toBe('lax')
		expect(Number(cookie['max-age'])).toBe(86400)
	})

	it('procura por email OU login, sempre em minúsculas e só entre ativos', async () => {
		const usuario = await comUsuario()

		await post(ROTA, { email: 'USUARIO@TESTE.DEV', password: SENHA_PADRAO })

		const [args] = prismaMock.User.findFirst.mock.calls.at(-1)
		expect(args.where.OR).toEqual([
			{ email: 'usuario@teste.dev' },
			{ login: 'usuario@teste.dev' }
		])
		expect(args.where.active).toBe(true)
		expect(usuario.email).toBe('usuario@teste.dev')
	})

	it('aceita o login no lugar do email', async () => {
		const usuario = await comUsuario()

		const { status } = await post(ROTA, {
			email: usuario.login,
			password: SENHA_PADRAO
		})

		expect(status).toBe(200)
	})
})

describe('POST /auth/session — credenciais inválidas', () => {
	it('senha errada responde 401', async () => {
		await comUsuario()

		const { status, body } = await post(ROTA, {
			email: 'usuario@teste.dev',
			password: 'senha-errada'
		})

		expect(status).toBe(401)
		expect(body.message).toBe('Usuário ou senha inválidos')
	})

	it('usuário inexistente responde a mesma mensagem genérica', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()

		const { status, body } = await post(ROTA, {
			email: 'ninguem@teste.dev',
			password: SENHA_PADRAO
		})

		expect(status).toBe(401)
		expect(body.message).toBe('Usuário ou senha inválidos')
	})

	it('usuário inativo não entra — o filtro está na consulta', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()

		const { status } = await post(ROTA, {
			email: 'inativo@teste.dev',
			password: SENHA_PADRAO
		})

		expect(status).toBe(401)
		expect(prismaMock.User.findFirst.mock.calls.at(-1)[0].where.active).toBe(
			true
		)
	})

	it('conta marcada como inativa depois da consulta também é barrada', async () => {
		await comUsuario({ active: false })

		const { status } = await post(ROTA, {
			email: 'usuario@teste.dev',
			password: SENHA_PADRAO
		})

		expect(status).toBe(401)
	})

	it('falha de login não grava cookie', async () => {
		await comUsuario()

		const { cookies } = await post(ROTA, {
			email: 'usuario@teste.dev',
			password: 'errada'
		})

		expect(cookies).toHaveLength(0)
	})

	it('compara hash mesmo sem usuário — tempo constante contra enumeração', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()

		const inicio = performance.now()
		await post(ROTA, { email: 'ninguem@teste.dev', password: SENHA_PADRAO })
		const semUsuario = performance.now() - inicio

		// bcrypt.compare contra o hash dummy custa tempo mensurável; sem a
		// mitigação a resposta seria imediata.
		expect(semUsuario).toBeGreaterThan(1)
	})
})

describe('POST /auth/session — validação do corpo', () => {
	it('sem senha responde 400', async () => {
		avancarJanelaDeLogin()

		const { status, body } = await post(ROTA, { email: 'a@b.dev' })

		expect(status).toBe(400)
		expect(body.error).toBe('Erro de Validação')
	})

	it('senha vazia responde 400', async () => {
		avancarJanelaDeLogin()

		const { status } = await post(ROTA, { email: 'a@b.dev', password: '' })

		expect(status).toBe(400)
	})

	it('lista o campo que falhou', async () => {
		avancarJanelaDeLogin()

		const { body } = await post(ROTA, { email: 'a@b.dev' })

		expect(body.details.errors.map(e => e.field)).toContain('password')
	})
})

describe('GET /auth/session', () => {
	it('sem cookie responde 401', async () => {
		const { status, body } = await get(ROTA)

		expect(status).toBe(401)
		expect(body.message).toBe('Token inválido ou expirado')
	})

	it('com cookie devolve os dados da sessão', async () => {
		const { cookie, usuario } = await loginAs({
			permissions: ['cards:read'],
			roles: ['VIEWER']
		})
		prismaMock.User.findUnique.mockResolvedValue(usuario)

		const { status, body } = await get(ROTA, { cookie })

		expect(status).toBe(200)
		expect(body.usuario).toMatchObject({
			id: usuario.id,
			email: usuario.email,
			roles: ['VIEWER'],
			permissions: ['cards:read']
		})
	})

	it('não devolve o hash da senha', async () => {
		const { cookie, usuario } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(usuario)

		const { body } = await get(ROTA, { cookie })

		expect(body.usuario.password_hash).toBeUndefined()
	})

	it('ignora o cabeçalho Authorization — a sessão é só por cookie', async () => {
		const { cookie } = await loginAs()
		const token = cookie.split('=')[1]

		const { status } = await get(ROTA, {
			headers: { authorization: `Bearer ${token}` }
		})

		expect(status).toBe(401)
	})

	it('cookie adulterado responde 401', async () => {
		const { status } = await get(ROTA, {
			cookie: 'access_token=nao.e.um.jwt'
		})

		expect(status).toBe(401)
	})

	it('usuário apagado depois do login responde 401', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(null)

		const { status, body } = await get(ROTA, { cookie })

		expect(status).toBe(401)
		expect(body.message).toBe('Usuário não encontrado ou inativo')
	})

	it('busca só entre usuários ativos', async () => {
		const { cookie, usuario } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue(usuario)

		await get(ROTA, { cookie })

		const [args] = prismaMock.User.findUnique.mock.calls.at(-1)
		expect(args.where).toMatchObject({ id: usuario.id, active: true })
		expect(args.omit).toEqual({ password_hash: true })
	})

	it('relê as permissões do banco, ignorando o cache', async () => {
		const { cookie, usuario } = await loginAs({ permissions: ['cards:read'] })
		prismaMock.User.findUnique.mockResolvedValue(usuario)
		const antes = prismaMock.userPermission.findMany.mock.calls.length

		await get(ROTA, { cookie })

		expect(prismaMock.userPermission.findMany.mock.calls.length).toBe(antes + 1)
	})
})

describe('DELETE /auth/session — logout', () => {
	it('responde 200', async () => {
		const { status, body } = await del(ROTA)

		expect(status).toBe(200)
		expect(body).toEqual({ success: true })
	})

	it('expira o cookie no browser', async () => {
		const { cookies } = await del(ROTA)
		const cookie = parseSetCookie(cookies[0])

		expect(cookie.name).toBe('access_token')
		expect(cookie.value).toBe('')
		expect(Number(cookie['max-age'])).toBe(0)
	})

	it('repete os atributos da gravação para o browser aceitar a remoção', async () => {
		const { cookies } = await del(ROTA)
		const cookie = parseSetCookie(cookies[0])

		expect(cookie.path).toBe('/')
		expect(cookie.httponly).toBe(true)
	})

	it('a sessão para de funcionar com o cookie apagado', async () => {
		await loginAs()

		const { status } = await get(ROTA, { cookie: 'access_token=' })

		expect(status).toBe(401)
	})
})

describe('POST /auth/session — rate limit', () => {
	it('login bem-sucedido não consome a cota', async () => {
		const usuario = await comUsuario()

		const status = []
		for (let i = 0; i < 8; i++) {
			const resposta = await post(ROTA, {
				email: usuario.email,
				password: SENHA_PADRAO
			})
			status.push(resposta.status)
		}

		// Oito logins certos na *mesma* janela. Contando toda requisição, o sexto
		// levava 429 — era o ciclo de login/logout esgotando o limite de brute
		// force.
		expect(status).toEqual(Array(8).fill(200))
	})

	it('o balde é por conta, não pela origem', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()

		for (let i = 0; i < 6; i++) {
			await post(ROTA, { email: 'alvo@teste.dev', password: SENHA_PADRAO })
		}

		const outraConta = await post(ROTA, {
			email: 'vizinho@teste.dev',
			password: SENHA_PADRAO
		})

		// Sob `app.handle()` não existe IP: se o limite estreito fosse por origem,
		// a conta do vizinho já entraria bloqueada — que é o que acontece atrás de
		// proxy reverso, onde todo mundo divide o mesmo IP.
		expect(outraConta.status).toBe(401)
	})

	it('bloqueia a partir da sexta tentativa na mesma janela', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()

		const status = []
		for (let i = 0; i < 6; i++) {
			const resposta = await post(ROTA, {
				email: 'ninguem@teste.dev',
				password: SENHA_PADRAO
			})
			status.push(resposta.status)
		}

		expect(status.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
		expect(status[5]).toBe(429)
	})

	it('a resposta 429 explica o limite', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()

		let ultima
		for (let i = 0; i < 6; i++) {
			ultima = await post(ROTA, {
				email: 'ninguem@teste.dev',
				password: SENHA_PADRAO
			})
		}

		expect(ultima.body).toMatchObject({
			error: 'Too Many Requests',
			statusCode: 429
		})
		expect(ultima.headers.get('x-ratelimit-limit')).toBe('5')
	})

	it('a janela seguinte volta a aceitar login', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)
		avancarJanelaDeLogin()
		for (let i = 0; i < 6; i++) {
			await post(ROTA, { email: 'ninguem@teste.dev', password: SENHA_PADRAO })
		}

		avancarJanelaDeLogin()
		const { status } = await post(ROTA, {
			email: 'ninguem@teste.dev',
			password: SENHA_PADRAO
		})

		expect(status).toBe(401)
	})

	it('IDS de teste são UUIDs aceitos pelos schemas', async () => {
		const { status } = await post(ROTA, { email: 'x', password: 'y' })

		expect([400, 401, 429]).toContain(status)
		expect(IDS.user).toMatch(/^[0-9a-f-]{36}$/)
	})
})
