import { setSystemTime } from 'bun:test'
import bcrypt from 'bcrypt'
import { sessaoService } from 'src/services/_sessao.service'
import { parseSetCookie, post } from './app'
import { prismaMock } from './prisma-mock'

/**
 * `POST /auth/session` tem rate limit de 5/min por IP e, sob `app.handle()`,
 * não existe IP — todo mundo cai na chave 'login:unknown'. Sem avançar o
 * relógio o sexto login da suíte inteira levaria 429.
 *
 * A base é monotônica de propósito: se algum teste resetar o relógio, o próximo
 * avanço ainda cai à frente de qualquer janela já registrada.
 */
let relogio = Date.now()

export function avancarJanelaDeLogin() {
	relogio += 61_000
	setSystemTime(new Date(relogio))
}

// Custo mínimo: o teste valida o fluxo, não a força do hash. Com custo 10 cada
// login somaria ~100 ms à suíte.
const TEST_COST = 4

export const IDS = {
	superAdmin: '01924f8a-0000-7000-8000-000000000001',
	admin: '01924f8a-0000-7000-8000-000000000002',
	user: '01924f8a-0000-7000-8000-000000000003',
	outro: '01924f8a-0000-7000-8000-000000000004',
	role: '01924f8a-0000-7000-8000-00000000000a',
	permission: '01924f8a-0000-7000-8000-00000000000b',
	card: '01924f8a-0000-7000-8000-00000000000c',
	inexistente: '01924f8a-0000-7000-8000-0000000000ff'
}

export const SENHA_PADRAO = 'senha-de-teste-123'

/** Registro de usuário como o Prisma devolveria. */
export async function userRecord(overrides = {}) {
	const { password = SENHA_PADRAO, ...rest } = overrides
	return {
		id: IDS.user,
		email: 'usuario@teste.dev',
		login: 'usuario',
		name: 'Usuário de Teste',
		active: true,
		password_hash: await bcrypt.hash(password, TEST_COST),
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		...rest
	}
}

/**
 * Programa as consultas de RBAC que `authorizationService` faz.
 * Uma única mock de `userRole.findMany` serve `getUserRoles` (lê `role.name`) e
 * `getUserPermissions` (lê `role.rolePermissions`).
 */
export function grantRbac({ permissions = [], roles = [] } = {}) {
	prismaMock.userPermission.findMany.mockResolvedValue(
		permissions.map(identifier => ({
			permission: { identifier, active: true }
		}))
	)
	prismaMock.userRole.findMany.mockResolvedValue(
		roles.map(name => ({
			role: { name, active: true, rolePermissions: [] }
		}))
	)
}

/**
 * Faz login de verdade (rota real, bcrypt real) e devolve o header `Cookie`.
 *
 * As permissões ficam no cache do `authorizationService` depois disto; para
 * trocá-las no meio de um teste, chame `authorizationService.clearCache()`.
 */
export async function loginAs(overrides = {}) {
	const {
		permissions = [],
		roles = [],
		password = SENHA_PADRAO,
		...rest
	} = overrides

	const usuario = await userRecord({ password, ...rest })
	prismaMock.User.findFirst.mockResolvedValue(usuario)
	grantRbac({ permissions, roles })
	avancarJanelaDeLogin()

	const response = await post('/api/seguranca/auth/session', {
		email: usuario.email,
		password
	})

	if (response.status !== 200) {
		throw new Error(
			`loginAs falhou: ${response.status} ${JSON.stringify(response.body)}`
		)
	}

	const cookie = parseSetCookie(response.cookies[0])

	// O `jwtPlugin` confere o estado da sessão (ativo, versão do token) a cada
	// requisição, lendo `User.findFirst`. Aquecer o cache aqui, enquanto o mock
	// ainda devolve este usuário, deixa o teste livre para reprogramar
	// `findFirst` depois do login sem derrubar a própria sessão.
	await sessaoService.estado(usuario.id)

	return {
		cookie: `${cookie.name}=${cookie.value}`,
		setCookie: cookie,
		usuario,
		body: response.body
	}
}

/** Atalho: super admin com o wildcard total. */
export const loginAsSuperAdmin = () =>
	loginAs({
		id: IDS.superAdmin,
		email: 'super@teste.dev',
		login: 'super',
		permissions: ['*'],
		roles: ['SUPER_ADMIN']
	})
