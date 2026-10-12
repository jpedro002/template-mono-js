import { Elysia } from 'elysia'
import { sessionController } from 'src/controllers/seguranca'
import { authenticate } from 'src/middleware'
import { rateLimitCheck, rateLimitHit } from 'src/plugins'
import { accessHistoryService } from 'src/services'
import { z } from 'zod'

const controller = sessionController()

const LoginSchema = {
	body: z.object({
		email: z.string().describe('Email ou login do usuário'),
		password: z
			.string()
			.min(1, 'Senha é obrigatória')
			.describe('Senha do usuário')
	}),
	response: {
		200: z.object({
			user: z.object({
				id: z.uuid().describe('ID do usuário (UUID)'),
				email: z.string().describe('Email do usuário'),
				login: z.string().describe('Login do usuário'),
				name: z.string().describe('Nome completo do usuário'),
				roles: z.array(z.string()).describe('Roles do usuário'),
				permissions: z.array(z.string()).describe('Permissões do usuário')
			})
		}),
		401: z.object({
			error: z.string().describe('Tipo do erro'),
			message: z.string().describe('Mensagem de erro')
		}),
		429: z.object({
			error: z.string().describe('Tipo do erro'),
			message: z.string().describe('Mensagem de erro'),
			statusCode: z.number().optional()
		})
	},
	detail: {
		tags: ['Segurança - Autenticação'],
		summary: 'Realizar login no sistema',
		description:
			'Autentica o usuário e grava o JWT em cookie httpOnly. O token não é devolvido no corpo da resposta.'
	}
}

const GetSessionSchema = {
	response: {
		200: z.object({
			usuario: z.object({
				id: z.uuid().describe('ID do usuário (UUID)'),
				email: z.email().describe('Email do usuário'),
				login: z.string().describe('Login do usuário'),
				name: z.string().describe('Nome completo do usuário'),
				roles: z.array(z.string()).describe('Roles do usuário'),
				permissions: z.array(z.string()).describe('Permissões do usuário'),
				createdAt: z.date().describe('Data de criação (ISO 8601)'),
				updatedAt: z.date().describe('Data de atualização (ISO 8601)'),
				active: z.boolean().describe('Status ativo do usuário')
			})
		}),
		401: z.object({
			error: z.string().describe('Tipo do erro'),
			message: z.string().describe('Mensagem de erro')
		})
	},
	detail: {
		tags: ['Segurança - Autenticação'],
		summary: 'Obter dados da sessão atual',
		description: 'Retorna dados do usuário autenticado com roles e permissões'
	}
}

/**
 * Rate limit do login: dois baldes, e **só tentativa falha conta** (ver
 * `rateLimitCheck` no plugin). Contando toda requisição, quatro ciclos de
 * login/logout esgotavam a cota e o quinto login com a senha certa levava 429.
 *
 * - por **conta**: é o que aperta, porque adivinhar senha é por conta e o balde
 *   não é dividido com quem entra pelo mesmo proxy;
 * - por **IP**: teto folgado contra varredura de muitas contas da mesma origem.
 *   Atrás de proxy reverso o IP é o do proxy e todo mundo cai na mesma chave —
 *   por isso ele não pode ser o limite estreito.
 */
const LIMITE_POR_CONTA = {
	max: 5,
	windowMs: 60_000,
	keyPrefix: 'login',
	keyBy: ({ body }) => body?.email?.toLowerCase()
}

const LIMITE_POR_IP = { max: 20, windowMs: 60_000, keyPrefix: 'login-ip' }

const registrarFalhaPorConta = rateLimitHit(LIMITE_POR_CONTA)
const registrarFalhaPorIp = rateLimitHit(LIMITE_POR_IP)

export const sessionRoutes = new Elysia({ prefix: '/auth' })
	// Caixa que o handler de login preenche e o `afterResponse` consome. Login
	// que falhou nunca a preenche, então o registro simplesmente não acontece —
	// e é também como o `afterHandle` sabe que a tentativa falhou.
	.derive(() => ({ accessEvent: {} }))
	// Rate limit estrito no login para mitigar brute force / credential stuffing.
	.post('/session', controller.login, {
		...LoginSchema,
		beforeHandle: [
			rateLimitCheck(LIMITE_POR_CONTA),
			rateLimitCheck(LIMITE_POR_IP)
		],
		// Conta a tentativa aqui, não no `beforeHandle`: neste ponto já se sabe se
		// a senha estava errada. Não devolve nada — valor de `afterHandle`
		// substituiria a resposta.
		afterHandle: ctx => {
			if (ctx.accessEvent?.userId) return
			registrarFalhaPorConta(ctx)
			registrarFalhaPorIp(ctx)
		},
		// Depois da resposta: o histórico de acesso é auditoria, não parte do
		// login. Um INSERT lento aqui não pode aparecer no tempo de resposta.
		afterResponse: ({ accessEvent }) =>
			accessHistoryService.recordLogin(accessEvent)
	})
	.get('/session', controller.getSession, {
		...GetSessionSchema,
		beforeHandle: [authenticate]
	})
	// Logout: só o servidor consegue apagar o cookie httpOnly.
	.delete('/session', controller.logout, {
		// Fecha a linha aberta no login (logout_at + session_duration). Também
		// depois da resposta — o cookie já foi expirado, o resto é auditoria.
		afterResponse: ({ user }) =>
			accessHistoryService.recordLogout({ userId: user?.id, jti: user?.jti }),
		response: {
			200: z.object({ success: z.boolean() })
		},
		detail: {
			tags: ['Segurança - Autenticação'],
			summary: 'Encerrar sessão',
			description: 'Remove o cookie de sessão do browser.'
		}
	})
