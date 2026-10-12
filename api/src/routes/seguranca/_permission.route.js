import { Elysia } from 'elysia'
import { permissionController } from 'src/controllers/seguranca'
import { authenticate, authorize } from 'src/middleware'
import { baseRouter, booleanoDeQuery } from 'src/routes/base.route'
import { z } from 'zod'

const controller = permissionController()

const PermissionSchema = z.object({
	id: z.uuid(),
	identifier: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	category: z.string(),
	active: z.boolean()
})

const PermissionCreateSchema = z.object({
	identifier: z.string().describe('Identificador único (recurso:ação)'),
	name: z.string().describe('Nome da permissão'),
	description: z.string().optional().describe('Descrição da permissão'),
	category: z.string().describe('Categoria da permissão')
})

const PermissionUpdateSchema = z.object({
	identifier: z.string().optional().describe('Identificador único'),
	name: z.string().optional().describe('Nome da permissão'),
	description: z.string().optional().describe('Descrição da permissão'),
	category: z.string().optional().describe('Categoria da permissão'),
	active: z.boolean().optional().describe('Status ativo')
})

export const permissionRoutes = new Elysia({ prefix: '/permissoes' })
	// Registrar rotas CRUD padrão usando baseRouter
	.use(
		baseRouter(controller, {
			tag: 'segurança - Permissões',
			summary: 'Permissão',
			schemas: {
				createSchema: PermissionCreateSchema,
				updateSchema: PermissionUpdateSchema,
				entitySchema: PermissionSchema
			},
			middleware: [authenticate, authorize('permissions:read')],
			postMiddleware: [authenticate, authorize('permissions:create')],
			putMiddleware: [authenticate, authorize('permissions:update')],
			deleteMiddleware: [authenticate, authorize('permissions:delete')],
			// Sem isto a permissão desligada some de toda listagem e o botão de
			// reativar não tem como aparecer. `getQuery` também porque a tela de
			// edição precisa alcançar a permissão inativa.
			listQuery: { incluir_inativas: booleanoDeQuery.optional() },
			getQuery: { incluir_inativas: booleanoDeQuery.optional() },
			putQuery: { incluir_inativas: booleanoDeQuery.optional() },
			entityName: 'permissão'
		})
	)

	// A outra metade do `DELETE`, que deixou de apagar a linha. Mesmo middleware,
	// de propósito: quem pode desligar tem de poder religar.
	.patch('/:id/ativar', controller.ativar, {
		beforeHandle: [authenticate, authorize('permissions:delete')],
		params: z.object({ id: z.uuid() }),
		response: { 200: z.object({ data: z.any() }), 404: z.any(), 422: z.any() },
		detail: {
			tags: ['segurança - Permissões'],
			summary: 'Reativar permissão',
			description:
				'`DELETE /permissoes/{id}` deixou de apagar a linha e passou a desligar o `active`: `role_permissions` e `user_permissions` têm `ON DELETE CASCADE`, então apagar de verdade retirava a permissão de toda role e de todo usuário, sem aviso e sem desfazer. Para enxergar o que reativar, liste com `incluir_inativas=true`.'
		}
	})

	// Rota customizada - Listar por categoria
	// Mesma permissão da listagem: só com sessão, o catálogo inteiro vazava por
	// categoria para qualquer usuário logado.
	.get('/category/:category', controller.listByCategory, {
		beforeHandle: [authenticate, authorize('permissions:read')],
		params: z.object({
			category: z.string().describe('Categoria da permissão')
		}),
		response: {
			200: z.array(PermissionSchema)
		},
		detail: {
			tags: ['segurança - Permissões'],
			summary: 'Listar por categoria',
			description: 'Retorna permissões de uma categoria específica'
		}
	})
