import { status } from 'elysia'
import { metrics } from 'src/helpers/_metrics.helper'
import { authorizationService } from 'src/services/index.js'

/**
 * Middleware que verifica se usuário está autenticado.
 * `user` é resolvido pelo jwtPlugin a partir do cookie de sessão (e só quando
 * a sessão não foi revogada — ver `_sessao.service.js`).
 */
const authenticate = ({ user }) => {
	if (!user?.id) {
		metrics.authz.decisao('authenticate', 'deny')
		return status(401, {
			error: 'Unauthorized',
			message: 'Token inválido ou expirado',
			statusCode: 401
		})
	}
	metrics.authz.decisao('authenticate', 'allow')
}

/**
 * Middleware que verifica se usuário tem permissão(ões) específica(s)
 */
function authorize(requiredPermissions, options = {}) {
	const permissions = Array.isArray(requiredPermissions)
		? requiredPermissions
		: [requiredPermissions]

	const { requireAll = false } = options

	return async ({ user, log }) => {
		if (!user?.id) {
			metrics.authz.decisao('authorize', 'unauthenticated')
			return status(401, {
				error: 'Unauthorized',
				message: 'Usuário não identificado',
				statusCode: 401
			})
		}

		const userPermissions = await authorizationService.getUserPermissions(
			user.id
		)

		// Verificar se usuário tem as permissões necessárias (levando em conta wildcards)
		const hasRequiredPermissions = permissions.map(perm =>
			authorizationService.checkPermissionMatch(perm, userPermissions)
		)

		const hasAccess = requireAll
			? hasRequiredPermissions.every(has => has)
			: hasRequiredPermissions.some(has => has)

		// A permissão exigida NÃO entra como atributo: `authorize` é chamado com
		// listas arbitrárias e cada lista distinta abriria uma série temporal nova.
		// Quem precisa saber *qual* permissão faltou olha o 403 no log, que carrega
		// `required`.
		if (!hasAccess) {
			metrics.authz.decisao('authorize', 'deny')
			// O que faltou vai para o log, não para a resposta: devolver a lista
			// de permissões exigidas ensinava a quem não tem acesso o mapa do RBAC.
			log?.warn('authz: acesso negado', {
				userId: user.id,
				required: permissions,
				requireAll
			})
			return status(403, {
				error: 'Forbidden',
				message: 'Você não tem permissão para acessar este recurso',
				statusCode: 403
			})
		}

		metrics.authz.decisao('authorize', 'allow')
	}
}

export { authenticate, authorize }
