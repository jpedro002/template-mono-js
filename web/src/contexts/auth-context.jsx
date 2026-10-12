import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect } from 'react'
import { temPermissoes } from 'src/lib/permissions'
import { persister } from 'src/lib/react-query'
import {
	CHAVE_LOGOUT,
	SEM_SESSAO,
	sessionKeys,
	useLogout,
	useSession,
} from 'src/services/auth'

/**
 * Estado global de autenticação, derivado do `GET /seguranca/auth/session`.
 *
 * Não há flag local de "logado": o cookie httpOnly é a fonte da verdade e quem
 * responde é a API.
 *
 * O cookie é compartilhado por origem, então as duas abas *chegariam* à mesma
 * resposta — mas só quando perguntassem. Com a sessão em cache por 5 minutos, a
 * aba que não clicou em "Sair" seguia renderizando a tela protegida (e os dados
 * já em cache) depois de o cookie ter sido apagado. Daí o listener de `storage`
 * abaixo: o logout de uma aba derruba a sessão local das outras na hora.
 */
const AuthContext = createContext()

export function AuthProvider({ children }) {
	// `isPending`, não `isLoading`: `isLoading` é `isPending && isFetching`, e
	// enquanto o `PersistQueryClientProvider` reidrata o cache a query fica
	// `pending` com `fetchStatus: 'idle'` — nessa janela `isLoading` é false com
	// `data` undefined. Quem olhasse `isLoading` daria `isReady: true` +
	// `isAuthenticated: false` e o `ProtectedRoute` chutaria para `/auth` antes de
	// a sessão ter sido perguntada: carga direta em rota protegida piscava o login
	// e só voltava depois da resposta. `isPending` cobre a reidratação e o
	// primeiro fetch, e é false num refetch (que tem `data`), então o login não
	// volta para o spinner.
	const { data, isPending } = useSession()
	const { mutate: logoutMutate } = useLogout()
	const queryClient = useQueryClient()

	useEffect(() => {
		const aoSairEmOutraAba = (evento) => {
			// `newValue` nulo é o `removeItem` de outra aba — não é logout.
			if (evento.key !== CHAVE_LOGOUT || !evento.newValue) return

			// A query da sessão fica: o observer do `useSession` acima está preso
			// ao objeto dela, e `removeQueries` o destrói — o `setQueryData`
			// seguinte criaria outra query, sem observer, e esta aba continuaria
			// renderizando a tela protegida com o usuário que já saiu.
			queryClient.removeQueries({
				predicate: (query) => query.queryKey?.[0] !== 'session',
			})
			queryClient.setQueryData(sessionKeys.get(), SEM_SESSAO)
			persister.removeClient()
		}

		window.addEventListener('storage', aoSairEmOutraAba)
		return () => window.removeEventListener('storage', aoSairEmOutraAba)
	}, [queryClient])

	const value = {
		session: data,
		sessionLoading: isPending,
		// Enquanto a primeira resposta não chega não dá para afirmar nem negar —
		// `ProtectedRoute` espera `isReady` antes de decidir.
		isReady: !isPending,
		isAuthenticated: Boolean(data?.user),
		logout: logoutMutate,
	}

	// Não bloqueia a árvore enquanto a sessão não responde. Bloquear aqui
	// serializava dois waits de rede: o `GET /auth/session` e, só depois dele, o
	// download do chunk `lazy()` da rota — dois loadings seguidos, com desenhos
	// diferentes. Sem o gate, o `import()` da página começa junto com a chamada
	// da sessão e quem decide o que mostrar é `ProtectedRoute` (e o `auth.jsx`),
	// que já esperam por `isReady`.
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
	const context = useContext(AuthContext)

	if (!context) {
		throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
	}

	return context
}

export function useAuthUser() {
	const { session } = useAuth()
	return session?.user || null
}

export function useAuthPermissions() {
	const { session } = useAuth()
	return session?.user?.permissions || []
}

export function useAuthRoles() {
	const { session } = useAuth()
	return session?.user?.roles || []
}

/**
 * Estes três moram aqui, e não em `services/auth`, porque leem a sessão do
 * contexto — e o contexto importa o service. Deixá-los lá fecharia o ciclo de
 * import.
 *
 * @param {string|string[]} requiredPermissions
 * @param {boolean} requireAll - exige o conjunto inteiro em vez de qualquer uma
 */
export function useHasPermission(requiredPermissions, requireAll = false) {
	const permissions = useAuthPermissions()
	return temPermissoes(requiredPermissions, permissions, { todas: requireAll })
}

export function useHasRole(requiredRoles, requireAll = false) {
	const roles = useAuthRoles()
	const lista = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]

	return requireAll
		? lista.every((role) => roles.includes(role))
		: lista.some((role) => roles.includes(role))
}

export function useCurrentUser() {
	return useAuthUser()
}
