import { Elysia } from 'elysia'
import { usuarioController } from 'src/controllers/seguranca'
import { authenticate, authorize } from 'src/middleware'
import { rateLimit } from 'src/plugins'
import { baseRouter } from 'src/routes'
import { booleanoDeQuery } from 'src/routes/base.route'
import { z } from 'zod'

const PerfilSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	email: z.email(),
	login: z.string(),
	phone: z.string().nullable(),
	emailVerifiedAt: z.date().nullable(),
	troca_email_pendente: z
		.object({ new_email: z.email(), expires_at: z.date() })
		.nullable()
})

// `strict` de propósito: descartar em silêncio um `password` mandado aqui
// deixaria o usuário achando que trocou a senha sem ter trocado nada.
const PerfilUpdateSchema = z
	.object({
		name: z.string().min(1, 'Nome é obrigatório').max(120).optional(),
		phone: z.string().max(20).nullish()
	})
	.strict()

const UsuarioCreateSchema = z.object({
	login: z
		.string()
		.min(1, 'Login é obrigatório')
		.max(90, 'Login deve ter no máximo 90 caracteres'),
	email: z
		.email('Email inválido')
		.max(200, 'Email deve ter no máximo 200 caracteres'),
	password: z
		.string()
		.min(8, 'Senha deve ter ao menos 8 caracteres')
		.max(128, 'Senha deve ter no máximo 128 caracteres'),
	name: z
		.string()
		.min(1, 'Nome é obrigatório')
		.max(90, 'Nome deve ter no máximo 90 caracteres'),

	active: z.boolean().optional().default(true)
})

const UsuarioUpdateSchema = z.object({
	login: z
		.string()
		.min(1, 'Login é obrigatório')
		.max(90, 'Login deve ter no máximo 90 caracteres')
		.optional(),
	email: z
		.email('Email inválido')
		.max(200, 'Email deve ter no máximo 200 caracteres')
		.optional(),
	name: z
		.string()
		.min(1, 'Nome é obrigatório')
		.max(90, 'Nome deve ter no máximo 90 caracteres')
		.optional(),

	active: z.boolean().optional()
})

const controller = usuarioController()

const listMiddleware = [authenticate, authorize('users:read')]
const createMiddleware = [authenticate, authorize('users:create')]
const updateMiddleware = [authenticate, authorize('users:update')]
const deleteMiddleware = [authenticate, authorize('users:delete')]

export const usuarioRoutes = new Elysia({ prefix: '/usuarios' })
	.use(
		baseRouter(controller, {
			tag: 'segurança - Usuários',
			summary: 'Gerenciamento de Usuários',
			entityName: 'usuário',
			// Sem isto o usuário inativado some de toda listagem e o botão de
			// reativar não tem como aparecer. `getQuery` também porque a tela de
			// edição precisa alcançar o registro inativo.
			// `role` é filtro, não rota nova: `?role=NOME` lista só quem tem o papel.
			listQuery: {
				incluir_inativos: booleanoDeQuery.optional(),
				role: z.string().max(64).optional()
			},
			putQuery: { incluir_inativos: booleanoDeQuery.optional() },
			listMiddleware: listMiddleware,
			getMiddleware: listMiddleware,
			postMiddleware: createMiddleware,
			putMiddleware: updateMiddleware,
			deleteMiddleware: deleteMiddleware,
			schemas: {
				createSchema: UsuarioCreateSchema,
				updateSchema: UsuarioUpdateSchema,
				entitySchema: z.any()
			}
		})
	)

	// A outra metade do `DELETE`, que sempre foi soft delete aqui e nunca teve
	// volta. Mesmo middleware do `DELETE`, de propósito: quem pode desligar tem
	// de poder religar — senão inativar vira porta de uma via só.
	.patch('/:id/ativar', controller.ativar, {
		beforeHandle: deleteMiddleware,
		params: z.object({ id: z.uuid() }),
		response: { 200: z.object({ data: z.any() }), 404: z.any(), 422: z.any() },
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Reativar usuário',
			description:
				'Desfaz o soft delete do `DELETE /usuarios/{id}`, que grava `deletedAt` **e** `active: false` — reativar religa os dois, senão o usuário volta às listagens sem conseguir entrar. Para enxergar quem reativar, liste com `incluir_inativos=true`.'
		}
	})

	// Perfil próprio: `authenticate` e nada mais. Estas rotas operam sobre
	// `user.id` do token, então o recorte é a autorização — exigir `users:*`
	// bloquearia quem só edita a própria conta.
	.get('/perfil', controller.perfil, {
		beforeHandle: [authenticate],
		response: {
			200: PerfilSchema,
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Dados pessoais do usuário logado',
			description:
				'O pedido pendente de troca de e-mail vem sem o token de confirmação.'
		}
	})
	.put('/perfil', controller.atualizarPerfil, {
		beforeHandle: [authenticate],
		body: PerfilUpdateSchema,
		response: {
			200: PerfilSchema.omit({ troca_email_pendente: true }),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Atualizar dados pessoais do usuário logado',
			description:
				'Não aceita senha nem e-mail: senha muda em `/update-password` (que confere a atual) e e-mail em `/auth/email/change/request`.'
		}
	})
	.post('/check-password', controller.checkPassword, {
		beforeHandle: [
			authenticate,
			rateLimit({ max: 10, windowMs: 60_000, keyPrefix: 'check-password' })
		],
		body: z.object({
			password: z.string().min(1, 'Senha é obrigatória')
		}),
		response: {
			200: z.object({ valida: z.boolean() }),
			404: z.object({ error: z.string() }),
			429: z.object({
				error: z.string(),
				message: z.string(),
				statusCode: z.number().optional()
			})
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Conferir a senha atual do usuário logado',
			description:
				'Não troca nada — só libera o formulário de segurança. Com limite de tentativas: é um oráculo de senha para quem roubou um cookie.'
		}
	})

	// Troca da própria senha: exige apenas autenticação (opera sobre
	// user.id do token) e a senha antiga no corpo.
	.post('/update-password', controller.updatePassword, {
		beforeHandle: [authenticate],
		body: z.object({
			oldPassword: z.string().min(1, 'Senha antiga obrigatória'),
			newPassword: z
				.string()
				.min(8, 'Nova senha deve ter ao menos 8 caracteres')
				.max(128, 'Nova senha deve ter no máximo 128 caracteres')
		}),
		response: {
			200: z.object({ success: z.boolean() }),
			400: z.object({ error: z.string() }),
			401: z.object({ error: z.string() }),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Atualizar senha do usuário',
			description:
				'Permite ao usuário trocar sua senha informando a senha antiga e a nova senha.'
		}
	})

	// Reset de senha por admin: opera sobre :id do path (não sobre o token),
	// exige só users:update — não pede a senha antiga, ao contrário de
	// /update-password (que é troca da própria senha).
	.post('/:id/reset-password', controller.resetPassword, {
		beforeHandle: updateMiddleware,
		params: z.object({
			id: z.uuid()
		}),
		body: z.object({
			newPassword: z
				.string()
				.min(8, 'Nova senha deve ter ao menos 8 caracteres')
				.max(128, 'Nova senha deve ter no máximo 128 caracteres')
		}),
		response: {
			200: z.object({ success: z.boolean() }),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Redefinir senha de usuário (admin)',
			description:
				'Permite a um admin redefinir a senha de outro usuário sem informar a senha antiga.'
		}
	})

	// Encerrar sessões: derruba todo token já emitido para o usuário (sobe a
	// `token_version`). `users:manage` e não `users:update` — é ação de
	// incidente, não edição de cadastro.
	.post('/:id/revogar-sessoes', controller.revogarSessoes, {
		beforeHandle: [authenticate, authorize('users:manage')],
		params: z.object({ id: z.uuid() }),
		response: {
			204: z.null(),
			403: z.any(),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Encerrar todas as sessões do usuário',
			description:
				'Invalida todo JWT já emitido para o usuário: a próxima requisição de cada sessão volta 401. Também acontece automaticamente ao desativar, excluir ou trocar a senha.'
		}
	})

	// Rota para atribuir role a usuário
	.post('/:id/roles/:roleId', controller.assignRole, {
		beforeHandle: updateMiddleware,
		params: z.object({
			id: z.uuid(),
			roleId: z.uuid()
		}),
		body: z
			.object({
				expiresAt: z.iso.datetime().optional()
			})
			.optional(),
		response: {
			200: z.any(),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Atribuir role a usuário',
			description: 'Atribui uma role (perfil) a um usuário'
		}
	})

	// Rota para remover role de usuário
	.delete('/:id/roles/:roleId', controller.removeRole, {
		beforeHandle: updateMiddleware,
		params: z.object({
			id: z.uuid(),
			roleId: z.uuid()
		}),
		response: {
			200: z.object({ success: z.boolean() }),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Remover role de usuário',
			description: 'Remove uma role (perfil) de um usuário'
		}
	})

	// Rota para atribuir permissão a usuário
	.post('/:id/permissions/:permissionId', controller.grantPermission, {
		beforeHandle: updateMiddleware,
		params: z.object({
			id: z.uuid(),
			permissionId: z.uuid()
		}),
		body: z
			.object({
				expiresAt: z.iso.datetime().optional()
			})
			.optional(),
		response: {
			200: z.any(),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Atribuir permissão a usuário',
			description: 'Atribui uma permissão específica a um usuário'
		}
	})

	// Rota para remover permissão de usuário
	.delete('/:id/permissions/:permissionId', controller.revokePermission, {
		beforeHandle: updateMiddleware,
		params: z.object({
			id: z.uuid(),
			permissionId: z.uuid()
		}),
		response: {
			200: z.object({ success: z.boolean() }),
			404: z.object({ error: z.string() })
		},
		detail: {
			tags: ['segurança - Usuários'],
			summary: 'Remover permissão de usuário',
			description: 'Remove uma permissão específica de um usuário'
		}
	})
