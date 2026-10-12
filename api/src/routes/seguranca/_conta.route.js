import { Elysia } from 'elysia'
import { contaController } from 'src/controllers/seguranca'
import { authenticate } from 'src/middleware'
import { rateLimit } from 'src/plugins'
import { z } from 'zod'

const controller = contaController()

const TAG = 'Segurança - Conta'

const senha = z
	.string()
	.min(8, 'Senha deve ter ao menos 8 caracteres')
	.max(128, 'Senha deve ter no máximo 128 caracteres')

const mensagem = z.object({ message: z.string() })
const erro = z.object({ error: z.string(), message: z.string() })
const bloqueado = z.object({
	error: z.string(),
	message: z.string(),
	statusCode: z.number().optional()
})

/**
 * Cadastro, recuperação de senha e troca de e-mail. Fica separado de
 * `_session.route` porque ali é só abrir e fechar sessão; aqui é o ciclo de vida
 * da conta.
 *
 * Todas as rotas públicas têm limite por IP: são as únicas superfícies onde um
 * anônimo escreve no banco ou dispara e-mail em nome do sistema.
 */
export const contaRoutes = new Elysia({ prefix: '/auth' })
	.post('/forgot-password', controller.forgotPassword, {
		beforeHandle: [
			rateLimit({ max: 5, windowMs: 60_000, keyPrefix: 'forgot' })
		],
		body: z.object({ email: z.email('E-mail inválido') }),
		response: { 200: mensagem, 429: bloqueado },
		detail: {
			tags: [TAG],
			summary: 'Pedir link de redefinição de senha',
			description:
				'Responde igual para e-mail cadastrado e não cadastrado — variar a mensagem transformaria a rota em consulta de quem tem conta. O link vale 1 hora e só serve uma vez.'
		}
	})
	.post('/reset-password', controller.resetPassword, {
		beforeHandle: [
			rateLimit({ max: 10, windowMs: 60_000, keyPrefix: 'reset' })
		],
		body: z
			.object({
				token: z.string().min(1, 'Token é obrigatório'),
				password: senha,
				password_confirmation: z.string().optional()
			})
			.refine(
				d => !d.password_confirmation || d.password_confirmation === d.password,
				{
					message: 'A confirmação da senha não confere.',
					path: ['password_confirmation']
				}
			),
		response: { 200: mensagem, 422: erro, 429: bloqueado },
		detail: {
			tags: [TAG],
			summary: 'Redefinir a senha com o token do e-mail'
		}
	})
	.post('/email/change/request', controller.requestEmailChange, {
		beforeHandle: [
			authenticate,
			rateLimit({ max: 5, windowMs: 60_000, keyPrefix: 'email-change' })
		],
		body: z.object({
			new_email: z.email('E-mail inválido').max(200),
			password: z.string().min(1, 'Senha atual é obrigatória')
		}),
		response: {
			200: z.object({
				message: z.string(),
				new_email: z.email(),
				expires_at: z.date()
			}),
			401: erro,
			404: z.object({ error: z.string() }),
			422: erro,
			429: bloqueado
		},
		detail: {
			tags: [TAG],
			summary: 'Pedir troca do e-mail da conta',
			description:
				'O link de confirmação vai para o **novo** endereço. Exige a senha atual: sem isso, uma sessão sequestrada troca o e-mail e o dono perde o caminho de recuperação.'
		}
	})
	.post('/email/verify/request', controller.requestEmailVerification, {
		beforeHandle: [
			authenticate,
			rateLimit({ max: 5, windowMs: 60_000, keyPrefix: 'email-verify' })
		],
		response: {
			200: z.object({
				message: z.string(),
				email: z.email(),
				expires_at: z.date()
			}),
			404: z.object({ error: z.string() }),
			422: erro,
			429: bloqueado
		},
		detail: {
			tags: [TAG],
			summary: 'Reenviar a confirmação do e-mail atual',
			description:
				'Para quem tem `emailVerifiedAt` nulo — contas criadas sem verificação nascem assim, e a tela de segurança exige e-mail verificado antes de trocar a senha. Sem corpo e sem senha: o link vai para o endereço que já está na conta e nada é alterado até o clique. Confirma-se em `/auth/email/change/confirm`, o mesmo link das duas coisas.'
		}
	})
	.post('/email/change/confirm', controller.confirmEmailChange, {
		beforeHandle: [
			rateLimit({ max: 10, windowMs: 60_000, keyPrefix: 'email-confirm' })
		],
		body: z.object({ token: z.string().min(1, 'Token é obrigatório') }),
		response: {
			200: z.object({
				message: z.string(),
				id: z.uuid(),
				email: z.email()
			}),
			422: erro,
			429: bloqueado
		},
		detail: {
			tags: [TAG],
			summary: 'Confirmar a troca de e-mail',
			description:
				'Pública: o link é aberto no cliente de e-mail, que pode não ser o browser da sessão. O JWT já emitido continua com o e-mail antigo no payload até expirar — nenhuma decisão de autorização usa esse campo.'
		}
	})
	.post('/email/change/cancel', controller.cancelEmailChange, {
		beforeHandle: [authenticate],
		response: {
			200: z.object({
				message: z.string(),
				had_pending_request: z.boolean()
			})
		},
		detail: {
			tags: [TAG],
			summary: 'Cancelar o pedido de troca de e-mail',
			description: 'O link já enviado deixa de valer.'
		}
	})
