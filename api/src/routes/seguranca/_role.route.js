import { Elysia } from 'elysia'
import { roleController } from 'src/controllers/seguranca'
import { authenticate, authorize } from 'src/middleware'
import { baseRouter, booleanoDeQuery } from 'src/routes/base.route'
import { z } from 'zod'

const controller = roleController()

const RolePermissionSchema = z.object({
	permission: z.object({
		id: z.uuid(),
		identifier: z.string(),
		name: z.string()
	})
})

const RoleSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	active: z.boolean(),
	rolePermissions: z.array(RolePermissionSchema)
})

const RoleCreateSchema = z.object({
	name: z.string().describe('Nome da role'),
	permissionIds: z
		.array(z.uuid())
		.optional()
		.describe('IDs das permissões a associar')
})

const RoleUpdateSchema = z.object({
	name: z.string().optional().describe('Nome da role'),
	permissionIds: z
		.array(z.uuid())
		.optional()
		.describe('IDs das permissões a associar'),
	active: z.boolean().optional().describe('Status ativo')
})

const UserSchema = z.object({
	id: z.uuid(),
	email: z.string(),
	login: z.string(),
	name: z.string(),
	active: z.boolean()
})

export const roleRoutes = new Elysia({ prefix: '/roles' })
	// Registrar rotas CRUD padrão usando baseRouter
	.use(
		baseRouter(controller, {
			tag: 'segurança - Roles',
			summary: 'Role',
			schemas: {
				createSchema: RoleCreateSchema,
				updateSchema: RoleUpdateSchema,
				entitySchema: RoleSchema
			},
			middleware: [authenticate, authorize('roles:read')],
			postMiddleware: [authenticate, authorize('roles:create')],
			putMiddleware: [authenticate, authorize('roles:update')],
			deleteMiddleware: [authenticate, authorize('roles:delete')],
			// Sem isto a role desligada some de toda listagem e o botão de reativar
			// não tem como aparecer. `getQuery` também porque a tela de edição
			// precisa alcançar a role inativa.
			listQuery: { incluir_inativas: booleanoDeQuery.optional() },
			putQuery: { incluir_inativas: booleanoDeQuery.optional() },
			entityName: 'role'
		})
	)

	// A outra metade do `DELETE`, que deixou de apagar a linha. Mesmo middleware,
	// de propósito: quem pode desligar tem de poder religar.
	.patch('/:id/ativar', controller.ativar, {
		beforeHandle: [authenticate, authorize('roles:delete')],
		params: z.object({ id: z.uuid() }),
		response: { 200: z.object({ data: z.any() }), 404: z.any(), 422: z.any() },
		detail: {
			tags: ['segurança - Roles'],
			summary: 'Reativar role',
			description:
				'`DELETE /roles/{id}` deixou de apagar a linha e passou a desligar o `active`: `user_roles` e `role_permissions` têm `ON DELETE CASCADE`, então apagar de verdade removia a role de todos os usuários que a tinham, sem aviso e sem desfazer. Para enxergar o que reativar, liste com `incluir_inativas=true`.'
		}
	})

	// Rota customizada - Listar usuários de uma role
	.get('/:id/users', controller.getUsersByRole, {
		beforeHandle: [authenticate, authorize('roles:read')],
		params: z.object({
			id: z.uuid().describe('ID da role')
		}),
		response: {
			200: z.array(UserSchema),
			404: z.object({
				error: z.string(),
				message: z.string(),
				statusCode: z.number().optional()
			})
		},
		detail: {
			tags: ['segurança - Roles'],
			summary: 'Listar usuários de uma role',
			description: 'Retorna todos os usuários que possuem uma role específica'
		}
	})
