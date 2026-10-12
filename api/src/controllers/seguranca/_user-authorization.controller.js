import { status } from 'elysia'
import { authorizationService, prisma } from 'src/services'
import { contencao } from './_contencao.js'

/**
 * GET - Listar permissões de um usuário
 */
const getUserPermissions = async ({ params, user }) => {
	const { userId } = params
	const { id: checkUser } = user

	// Verificar se o usuário está tentando acessar suas próprias permissões ou tem permissão admin
	if (
		userId !== user.id &&
		!(await authorizationService.hasPermission(checkUser, 'users:manage'))
	) {
		return status(403, {
			error: 'Acesso negado',
			message:
				'Você não tem permissão para visualizar permissões de outros usuários'
		})
	}

	const permissions = await authorizationService.getUserPermissions(userId)
	return { userId, permissions }
}

/**
 * GET - Listar roles de um usuário
 */
const getUserRoles = async ({ params, user }) => {
	const { userId } = params
	const { id: checkUser } = user

	// Verificar se o usuário está tentando acessar seus próprios roles ou tem permissão admin
	if (
		userId !== user.id &&
		!(await authorizationService.hasPermission(checkUser, 'users:manage'))
	) {
		return status(403, {
			error: 'Acesso negado',
			message: 'Você não tem permissão para visualizar roles de outros usuários'
		})
	}

	const roles = await authorizationService.getUserRoles(userId)
	return { userId, roles }
}

/**
 * GET - Listar detalhes completos das permissões de um usuário (diretas + via roles)
 */
const getUserPermissionsDetail = async ({ params, user }) => {
	const { userId } = params
	const { id: checkUser } = user

	// Verificar acesso
	if (
		userId !== user.id &&
		!(await authorizationService.hasPermission(checkUser, 'users:manage'))
	) {
		return status(403, {
			error: 'Acesso negado',
			message:
				'Você não tem permissão para visualizar detalhes de permissões de outros usuários'
		})
	}

	// Buscar permissões diretas
	const directPermissions = await prisma.userPermission.findMany({
		where: {
			userId,
			OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
		},
		include: {
			permission: {
				select: { id: true, identifier: true, name: true, category: true }
			}
		}
	})

	// Buscar permissões via roles
	const userRoles = await prisma.userRole.findMany({
		where: { userId },
		include: {
			role: {
				select: {
					id: true,
					name: true,
					rolePermissions: {
						include: {
							permission: {
								select: {
									id: true,
									identifier: true,
									name: true,
									category: true
								}
							}
						}
					}
				}
			}
		}
	})

	return {
		userId,
		directPermissions: directPermissions.map(up => ({
			...up.permission,
			grantedAt: up.grantedAt,
			expiresAt: up.expiresAt,
			grantedBy: up.grantedBy
		})),
		rolePermissions: userRoles.flatMap(ur => ({
			roleName: ur.role.name,
			roleId: ur.role.id,
			permissions: ur.role.rolePermissions.map(rp => rp.permission)
		}))
	}
}

/**
 * POST - Conceder permissão a um usuário
 */
const grantPermission = async ({ body, user }) => {
	const { userId, permissionId } = body
	const { id: grantedBy } = user

	// Validar que o usuário existe
	const target = await prisma.User.findUnique({ where: { id: userId } })
	if (!target) {
		return status(404, {
			error: 'Usuário não encontrado',
			message: `Usuário com ID ${userId} não existe`
		})
	}

	// Validar que a permissão existe
	const permission = await prisma.permission.findUnique({
		where: { id: permissionId }
	})
	if (!permission) {
		return status(404, {
			error: 'Permissão não encontrada',
			message: `Permissão com ID ${permissionId} não existe`
		})
	}

	const negado =
		(await contencao.conferirAlvo(user, userId)) ??
		(await contencao.conferirPermissoes(user, [permission.identifier]))
	if (negado) return negado

	const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null

	const userPermission = await authorizationService.grantPermissionToUser(
		userId,
		permissionId,
		grantedBy,
		expiresAt
	)

	return status(201, {
		userId,
		permissionId,
		permission,
		grantedAt: userPermission.grantedAt,
		expiresAt: userPermission.expiresAt
	})
}

/**
 * DELETE - Revogar permissão de um usuário
 */
const revokePermission = async ({ params, user, set }) => {
	const { userId, permissionId } = params
	const { id: revokedBy } = user

	const negado = await contencao.conferirAlvo(user, userId)
	if (negado) return negado

	await authorizationService.revokePermissionFromUser(
		userId,
		permissionId,
		revokedBy
	)

	set.status = 204
	return null
}

/**
 * POST - Atribuir role a um usuário
 */
const assignRole = async ({ body, user }) => {
	const { userId, roleId } = body
	const { id: assignedBy } = user

	// Validar que o usuário existe
	const target = await prisma.User.findUnique({ where: { id: userId } })
	if (!target) {
		return status(404, {
			error: 'Usuário não encontrado',
			message: `Usuário com ID ${userId} não existe`
		})
	}

	// Validar que a role existe
	const role = await prisma.role.findUnique({ where: { id: roleId } })
	if (!role) {
		return status(404, {
			error: 'Role não encontrada',
			message: `Role com ID ${roleId} não existe`
		})
	}

	const negado =
		(await contencao.conferirAlvo(user, userId)) ??
		(await contencao.conferirRole(user, roleId))
	if (negado) return negado

	const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null

	const userRole = await authorizationService.assignRoleToUser(
		userId,
		roleId,
		assignedBy,
		expiresAt
	)

	return status(201, {
		userId,
		roleId,
		role,
		assignedAt: userRole.assignedAt,
		expiresAt: userRole.expiresAt
	})
}

/**
 * DELETE - Remover role de um usuário
 */
const removeRole = async ({ params, user, set }) => {
	const { userId, roleId } = params
	const { id: removedBy } = user

	const negado =
		(await contencao.conferirAlvo(user, userId)) ??
		(await contencao.conferirRole(user, roleId))
	if (negado) return negado

	await authorizationService.removeRoleFromUser(userId, roleId, removedBy)

	set.status = 204
	return null
}

export const userAuthorizationController = () => ({
	getUserPermissions,
	getUserRoles,
	getUserPermissionsDetail,
	grantPermission,
	revokePermission,
	assignRole,
	removeRole
})
