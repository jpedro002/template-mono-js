import { useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import {
	useAuth,
	useAuthPermissions,
	useAuthRoles,
} from 'src/contexts/auth-context'
import { preloadRoute } from 'src/generated/rota-preload'
import { temPermissoes } from 'src/lib/permissions'
import { rotaDeLoginCom } from 'src/lib/return-to'
import { toast } from 'src/lib/toast'
import RootLoading from 'src/pages/loading.jsx'

/**
 * Exige sessão. Sem ela, manda para o login **com o destino pretendido** em
 * `?returnTo=` — quem abre um link fundo (ou volta com a sessão expirada)
 * termina onde queria, não na home.
 *
 * @example
 * <ProtectedRoute>
 *   <Dashboard />
 * </ProtectedRoute>
 */
export function ProtectedRoute({ children }) {
	const { isAuthenticated, isReady } = useAuth()
	const localizacao = useLocation()

	// O `import()` da página só aconteceria depois de a sessão responder — o
	// `lazy()` está abaixo deste gate. Disparar aqui põe os dois downloads em
	// paralelo, e é seguro porque este gate só exige sessão: não há permissão
	// para vazar num chunk. O `PermissionRoute` abaixo não faz isto de
	// propósito (achado 41 da auditoria).
	useEffect(() => {
		if (!isReady) preloadRoute(localizacao.pathname)
	}, [isReady, localizacao.pathname])

	if (!isReady) return <RootLoading />
	if (!isAuthenticated) {
		return <Navigate to={rotaDeLoginCom(localizacao)} replace />
	}

	return children
}

/**
 * Exige permissão. O gate é o mesmo que a API aplica na rota — ver
 * `src/lib/permissions.js`.
 *
 * Sem permissão, mostra um aviso único e volta para a tela anterior (QA 37.3),
 * em vez de mandar para `/404`.
 *
 * @example
 * <PermissionRoute permission='users:create'>
 *   <CreateUser />
 * </PermissionRoute>
 */
export function PermissionRoute({
	children,
	permission,
	requireAll = false,
	fallback = null,
}) {
	const { isAuthenticated, isReady } = useAuth()
	const permissions = useAuthPermissions()
	const localizacao = useLocation()

	if (!isReady) return <RootLoading />
	if (!isAuthenticated) {
		return <Navigate to={rotaDeLoginCom(localizacao)} replace />
	}

	if (!temPermissoes(permission, permissions, { todas: requireAll })) {
		return fallback || <SemAcesso />
	}

	return children
}

/**
 * Tela fora do alcance do perfil: um aviso só (o mesmo `id` do handler global
 * de 403) e volta para a tela anterior, ou para a inicial quando o link foi
 * aberto direto (QA 37.3). Não abre a tela pela metade.
 */
function SemAcesso() {
	const navigate = useNavigate()

	useEffect(() => {
		toast.error('Você não tem acesso a esta tela.', { id: 'acesso-negado' })
		if (window.history.state?.idx > 0) navigate(-1)
		else navigate('/', { replace: true })
	}, [navigate])

	return <RootLoading />
}

/**
 * Exige role. Prefira `PermissionRoute` — role é quem o usuário é, permissão é
 * o que ele pode; a API cobra a segunda.
 *
 * @example
 * <RoleRoute role='Administrador'>
 *   <AdminPanel />
 * </RoleRoute>
 */
export function RoleRoute({ children, role, fallback = null }) {
	const { isAuthenticated, isReady } = useAuth()
	const roles = useAuthRoles()
	const localizacao = useLocation()

	if (!isReady) return <RootLoading />
	if (!isAuthenticated) {
		return <Navigate to={rotaDeLoginCom(localizacao)} replace />
	}

	const lista = Array.isArray(role) ? role : [role]

	if (!lista.some((r) => roles.includes(r))) {
		return fallback || <Navigate to='/404' replace />
	}

	return children
}
