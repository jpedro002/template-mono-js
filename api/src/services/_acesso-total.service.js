import { prisma } from 'src/services/_prisma.service'

/**
 * Trava contra ficar sem administrador: nenhuma operação pode deixar o sistema
 * sem pelo menos um usuário ativo com `*`.
 *
 * Sem isto, o último SUPER_ADMIN remove o próprio perfil (a contenção libera
 * agir sobre si mesmo) ou desativa a si mesmo, e não sobra ninguém que consiga
 * conceder acesso de volta — o conserto passa a ser SQL direto no banco.
 *
 * A regra é "antes havia alguém, depois não haveria": se a base já está sem
 * ninguém com `*` (banco recém-criado, antes do seed), a trava não se aplica —
 * bloquear ali só impediria o conserto.
 */

const naoExpirado = agora => [{ expiresAt: null }, { expiresAt: { gt: agora } }]

async function detentores() {
	const agora = new Date()
	const ativo = { active: true, deletedAt: null }
	const tudo = { identifier: '*', active: true }

	const [diretas, viaRole] = await Promise.all([
		prisma.userPermission.findMany({
			where: { user: ativo, permission: tudo, OR: naoExpirado(agora) },
			select: { userId: true, permissionId: true }
		}),
		prisma.userRole.findMany({
			where: {
				user: ativo,
				role: {
					active: true,
					rolePermissions: { some: { permission: tudo } }
				},
				OR: naoExpirado(agora)
			},
			select: { userId: true, roleId: true }
		})
	])

	return [
		...diretas.map(d => ({ ...d, via: 'permission' })),
		...viaRole.map(r => ({ ...r, via: 'role' }))
	]
}

function erroDeTrava() {
	const error = new Error(
		'Operação bloqueada: deixaria o sistema sem nenhum usuário ativo com acesso total (*).'
	)
	error.statusCode = 409
	return error
}

/**
 * Lança 409 quando, descontadas as concessões que `removidas` aponta, não
 * sobraria nenhum usuário com `*`.
 *
 * @param {(concessao: {userId: string, roleId?: string, permissionId?: string, via: 'role'|'permission'}) => boolean} removidas
 */
async function conferir(removidas) {
	const antes = await detentores()
	if (antes.length === 0) return

	const depois = new Set(antes.filter(c => !removidas(c)).map(c => c.userId))
	if (depois.size === 0) throw erroDeTrava()
}

export const acessoTotalService = {
	conferir,
	/** Remover a role do usuário. */
	semRoleDoUsuario: (userId, roleId) =>
		conferir(
			c => c.via === 'role' && c.userId === userId && c.roleId === roleId
		),
	/** Revogar a permissão direta do usuário. */
	semPermissaoDoUsuario: (userId, permissionId) =>
		conferir(
			c =>
				c.via === 'permission' &&
				c.userId === userId &&
				c.permissionId === permissionId
		),
	/** Desativar ou excluir o usuário. */
	semUsuario: userId => conferir(c => c.userId === userId),
	/** Desativar a role ou tirar dela o `*`. */
	semRole: roleId => conferir(c => c.via === 'role' && c.roleId === roleId)
}
