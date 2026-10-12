import { Elysia } from 'elysia'
import { userAuthorizationController } from 'src/controllers/seguranca'
import { authenticate, authorize } from 'src/middleware'
import { z } from 'zod'

const controller = userAuthorizationController()

const PermissionDetail = z.object({
	id: z.uuid(),
	identifier: z.string(),
	name: z.string(),
	category: z.string(),
	grantedAt: z.date(),
	expiresAt: z.date().nullable(),
	grantedBy: z.string()
})

const RolePermissionDetail = z.object({
	roleName: z.string(),
	roleId: z.uuid(),
	permissions: z.array(
		z.object({
			id: z.uuid(),
			identifier: z.string(),
			name: z.string(),
			category: z.string()
		})
	)
})

const errorSchema = z.object({
	error: z.string(),
	message: z.string()
})

export const userAuthorizationRoutes = new Elysia({ prefix: '/usuarios' })
	/**
	 * GET - Listar permissões do usuário (resumido)
	 */
	.get('/users/:userId/permissions', controller.getUserPermissions, {
		beforeHandle: [authenticate],
		params: z.object({
			userId: z.uuid().describe('ID do usuário')
		}),
		response: {
			200: z.object({
				userId: z.uuid(),
				permissions: z.array(z.string())
			}),
			403: errorSchema,
			404: errorSchema
		},
		detail: {
			tags: ['segurança - Autorização de Usuários'],
			summary: 'Listar permissões do usuário',
			description:
				'Retorna lista de permissões de um usuário (diretas e via roles)'
		}
	})

	/**
	 * GET - Listar permissões do usuário (detalhado)
	 */
	.get(
		'/users/:userId/permissions/detail',
		controller.getUserPermissionsDetail,
		{
			beforeHandle: [authenticate],
			params: z.object({
				userId: z.uuid().describe('ID do usuário')
			}),
			response: {
				200: z.object({
					userId: z.uuid(),
					directPermissions: z.array(PermissionDetail),
					rolePermissions: z.array(RolePermissionDetail)
				}),
				403: errorSchema,
				404: errorSchema
			},
			detail: {
				tags: ['segurança - Autorização de Usuários'],
				summary: 'Detalhes das permissões do usuário',
				description:
					'Retorna detalhes completos de permissões diretas e via roles'
			}
		}
	)

	/**
	 * GET - Listar roles do usuário
	 */
	.get('/users/:userId/roles', controller.getUserRoles, {
		beforeHandle: [authenticate],
		params: z.object({
			userId: z.uuid().describe('ID do usuário')
		}),
		response: {
			200: z.object({
				userId: z.uuid(),
				roles: z.array(z.string())
			}),
			403: errorSchema,
			404: errorSchema
		},
		detail: {
			tags: ['segurança - Autorização de Usuários'],
			summary: 'Listar roles do usuário',
			description: 'Retorna lista de roles atribuídas a um usuário'
		}
	})

	/**
	 * POST - Conceder permissão a um usuário
	 */
	.post('/users/permissions/grant', controller.grantPermission, {
		beforeHandle: [
			authenticate,
			authorize('users:manage'),
			authorize('permissions:assign')
		],
		body: z.object({
			userId: z.uuid().describe('ID do usuário'),
			permissionId: z.uuid().describe('ID da permissão'),
			expiresAt: z.iso
				.datetime()
				.optional()
				.describe('Data de expiração da permissão (ISO 8601)')
		}),
		response: {
			201: z.object({
				userId: z.uuid(),
				permissionId: z.uuid(),
				permission: z.any(),
				grantedAt: z.date(),
				expiresAt: z.date().nullable()
			}),
			400: errorSchema,
			403: errorSchema,
			404: errorSchema
		},
		detail: {
			tags: ['segurança - Autorização de Usuários'],
			summary: 'Conceder permissão a usuário',
			description:
				'Atribui uma permissão direta a um usuário, opcionalmente com data de expiração'
		}
	})

	/**
	 * DELETE - Revogar permissão de um usuário
	 */
	.delete(
		'/users/:userId/permissions/:permissionId',
		controller.revokePermission,
		{
			beforeHandle: [
				authenticate,
				authorize('users:manage'),
				authorize('permissions:revoke')
			],
			params: z.object({
				userId: z.uuid().describe('ID do usuário'),
				permissionId: z.uuid().describe('ID da permissão')
			}),
			response: {
				204: z.null(),
				403: errorSchema,
				404: errorSchema
			},
			detail: {
				tags: ['segurança - Autorização de Usuários'],
				summary: 'Revogar permissão de usuário',
				description: 'Remove uma permissão direta de um usuário'
			}
		}
	)

	/**
	 * POST - Atribuir role a um usuário
	 */
	.post('/users/roles/assign', controller.assignRole, {
		beforeHandle: [
			authenticate,
			authorize('users:manage'),
			authorize('roles:assign')
		],
		body: z.object({
			userId: z.uuid().describe('ID do usuário'),
			roleId: z.uuid().describe('ID da role'),
			expiresAt: z.iso
				.datetime()
				.optional()
				.describe('Data de expiração da role (ISO 8601)')
		}),
		response: {
			201: z.object({
				userId: z.uuid(),
				roleId: z.uuid(),
				role: z.any(),
				assignedAt: z.date(),
				expiresAt: z.date().nullable()
			}),
			400: errorSchema,
			403: errorSchema,
			404: errorSchema
		},
		detail: {
			tags: ['segurança - Autorização de Usuários'],
			summary: 'Atribuir role a usuário',
			description:
				'Atribui uma role a um usuário, opcionalmente com data de expiração'
		}
	})

	/**
	 * DELETE - Remover role de um usuário
	 */
	.delete('/users/:userId/roles/:roleId', controller.removeRole, {
		beforeHandle: [
			authenticate,
			authorize('users:manage'),
			authorize('roles:revoke')
		],
		params: z.object({
			userId: z.uuid().describe('ID do usuário'),
			roleId: z.uuid().describe('ID da role')
		}),
		response: {
			204: z.null(),
			403: errorSchema,
			404: errorSchema
		},
		detail: {
			tags: ['segurança - Autorização de Usuários'],
			summary: 'Remover role de usuário',
			description: 'Remove uma role atribuída a um usuário'
		}
	})
