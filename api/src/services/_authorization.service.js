import { metrics } from 'src/helpers/_metrics.helper'
import { soExplicita } from 'src/helpers/_permissoes-explicitas'
import { acessoTotalService } from 'src/services/_acesso-total.service'
import { auditoriaService } from 'src/services/_auditoria.service'
import { cache } from 'src/services/_cache.service'
import { prisma } from 'src/services/_prisma.service'

/**
 * Recursos que `*:acao` não alcança. `*:delete` concedido para "apagar qualquer
 * coisa do domínio" não pode virar apagar usuário, role ou trilha de auditoria:
 * aqui só valem `*` (acesso total) ou o recurso nomeado (`users:*`,
 * `users:delete`). Espelhado em `web/src/lib/permissions.js`.
 */
export const SEGURANCA_RECURSOS = ['users', 'roles', 'permissions', 'auditoria']

/**
 * Cache de permissões no `cacheService`, não num Map do processo: com o driver
 * `redis` a revogação vale na hora em todas as instâncias. Com `memory`
 * (instância única, dev, teste) o comportamento é o de antes.
 */
const TTL = 5 * 60
const cachePermissoes = cache.namespace('authz:perms', { ttl: TTL })

const naoExpirado = agora => [{ expiresAt: null }, { expiresAt: { gt: agora } }]
const usuarioAtivo = { active: true, deletedAt: null }

/**
 * Obtém todas as permissões de um usuário (com cache)
 * @param {string} userId - ID do usuário
 * @param {boolean} forceRefresh - Se true, ignora o cache e busca direto do banco
 */
async function getUserPermissions(userId, forceRefresh = false) {
	if (!forceRefresh) {
		const cached = await cachePermissoes.get(userId)
		if (cached !== undefined) {
			metrics.authz.cache('hit')
			return cached
		}
	}

	metrics.authz.cache(forceRefresh ? 'bypass' : 'miss')

	const now = new Date()
	const [directPermissions, rolePermissions] = await Promise.all([
		prisma.userPermission.findMany({
			where: { userId, user: usuarioAtivo, OR: naoExpirado(now) },
			include: { permission: true }
		}),
		prisma.userRole.findMany({
			where: {
				userId,
				user: usuarioAtivo,
				OR: naoExpirado(now),
				role: { active: true }
			},
			include: {
				role: {
					include: { rolePermissions: { include: { permission: true } } }
				}
			}
		})
	])

	const permissions = new Set()

	for (const up of directPermissions) {
		if (up.permission.active) permissions.add(up.permission.identifier)
	}

	for (const ur of rolePermissions) {
		for (const rp of ur.role.rolePermissions) {
			if (rp.permission.active) permissions.add(rp.permission.identifier)
		}
	}

	// `*` já cobre tudo, menos as permissões só explícitas — essas continuam
	// listadas para o `checkPermissionMatch` achar por igualdade.
	if (permissions.has('*')) {
		const explicitas = [...permissions].filter(soExplicita)
		permissions.clear()
		permissions.add('*')
		for (const identifier of explicitas) permissions.add(identifier)
	}

	const permissionArray = Array.from(permissions)
	await cachePermissoes.set(userId, permissionArray)

	return permissionArray
}

/**
 * Obtém todos os roles de um usuário. Mesmo recorte de `getUserPermissions`:
 * usuário inativo ou excluído não tem role nenhuma.
 */
async function getUserRoles(userId) {
	const now = new Date()
	const userRoles = await prisma.userRole.findMany({
		where: {
			userId,
			user: usuarioAtivo,
			OR: naoExpirado(now),
			role: { active: true }
		},
		include: { role: true }
	})
	return userRoles.map(ur => ur.role.name)
}

/**
 * Verifica se usuário tem uma permissão específica
 */
async function hasPermission(userId, requiredPermission) {
	const userPermissions = await getUserPermissions(userId)
	return checkPermissionMatch(requiredPermission, userPermissions)
}

/**
 * Verifica se permissão é concedida (suporta wildcards)
 */
function checkPermissionMatch(required, userPermissions) {
	if (userPermissions.includes(required)) return true

	if (soExplicita(required)) return false

	if (userPermissions.includes('*')) return true

	const [resource, action] = required.split(':')

	if (!resource || !action) return false

	if (userPermissions.includes(`${resource}:*`)) return true

	// `*:acao` não alcança os recursos de segurança — ver SEGURANCA_RECURSOS.
	if (SEGURANCA_RECURSOS.includes(resource)) return false

	if (userPermissions.includes(`*:${action}`)) return true

	return false
}

/**
 * Concede permissão a um usuário
 */
async function grantPermissionToUser(
	userId,
	permissionId,
	grantedBy,
	expiresAt = null
) {
	const userPermission = await prisma.$transaction(async tx => {
		const antes = await tx.userPermission.findUnique({
			where: { userId_permissionId: { userId, permissionId } },
			select: { expiresAt: true }
		})
		const linha = await tx.userPermission.upsert({
			where: { userId_permissionId: { userId, permissionId } },
			create: { userId, permissionId, grantedBy, expiresAt },
			update: { expiresAt, grantedBy, grantedAt: new Date() }
		})
		await auditoriaService.registrar(tx, {
			actorId: grantedBy,
			action: 'permission.grant',
			targetUserId: userId,
			permissionId,
			before: antes ?? undefined,
			after: { expiresAt }
		})
		return linha
	})

	await clearCache(userId)

	return userPermission
}

/**
 * Remove permissão de um usuário
 */
async function revokePermissionFromUser(userId, permissionId, revokedBy) {
	await acessoTotalService.semPermissaoDoUsuario(userId, permissionId)

	await prisma.$transaction(async tx => {
		await tx.userPermission.delete({
			where: { userId_permissionId: { userId, permissionId } }
		})
		await auditoriaService.registrar(tx, {
			actorId: revokedBy,
			action: 'permission.revoke',
			targetUserId: userId,
			permissionId
		})
	})

	await clearCache(userId)
}

/**
 * Atribui role a um usuário
 */
async function assignRoleToUser(userId, roleId, assignedBy, expiresAt = null) {
	const userRole = await prisma.$transaction(async tx => {
		const antes = await tx.userRole.findUnique({
			where: { userId_roleId: { userId, roleId } },
			select: { expiresAt: true }
		})
		const linha = await tx.userRole.upsert({
			where: { userId_roleId: { userId, roleId } },
			create: { userId, roleId, assignedBy, expiresAt },
			update: { expiresAt, assignedBy, assignedAt: new Date() }
		})
		await auditoriaService.registrar(tx, {
			actorId: assignedBy,
			action: 'role.assign',
			targetUserId: userId,
			roleId,
			before: antes ?? undefined,
			after: { expiresAt }
		})
		return linha
	})

	await clearCache(userId)

	return userRole
}

/**
 * Remove role de um usuário
 */
async function removeRoleFromUser(userId, roleId, removedBy) {
	await acessoTotalService.semRoleDoUsuario(userId, roleId)

	await prisma.$transaction(async tx => {
		await tx.userRole.delete({
			where: { userId_roleId: { userId, roleId } }
		})
		await auditoriaService.registrar(tx, {
			actorId: removedBy,
			action: 'role.revoke',
			targetUserId: userId,
			roleId
		})
	})

	await clearCache(userId)
}

/**
 * Cria nova permissão
 */
async function createPermission(data) {
	const permission = await prisma.permission.create({ data })
	await clearCache()
	return permission
}

/**
 * Cria novo role
 */
async function createRole(name, description, permissionIds = [], actorId) {
	const role = await prisma.$transaction(async tx => {
		const criada = await tx.role.create({
			data: {
				name,
				description,
				rolePermissions: {
					createMany: {
						data: permissionIds.map(permissionId => ({ permissionId }))
					}
				}
			},
			include: { rolePermissions: { include: { permission: true } } }
		})
		await auditoriaService.registrar(tx, {
			actorId,
			action: 'role.create',
			roleId: criada.id,
			after: { name, permissionIds }
		})
		return criada
	})

	await clearCache()

	return role
}

/**
 * Limpa o cache de permissões: de um usuário ou de todos.
 */
async function clearCache(userId = null) {
	if (userId) {
		await cachePermissoes.del(userId)
	} else {
		await cachePermissoes.invalidate()
	}
}

export const authorizationService = {
	getUserPermissions,
	getUserRoles,
	hasPermission,
	checkPermissionMatch,
	grantPermissionToUser,
	revokePermissionFromUser,
	assignRoleToUser,
	removeRoleFromUser,
	createPermission,
	createRole,
	clearCache
}
