import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { rotaDeLoginCom } from './return-to'
import { toast } from './toast'

// ==========================================
// Tratamento Global de Erros
// ==========================================
const handleAuthError = (error) => {
	const status = error?.response?.status
	const message = error?.response?.data?.message

	// Cookie de sessão expirado ou revogado. Não há token local para limpar —
	// só o cache, que ficaria com dados de uma sessão que já não vale (e é
	// persistido em localStorage, então sobreviveria ao reload).
	// `GET /auth/session` trata o próprio 401 e não chega aqui.
	if (status === 401) {
		// Sessão local já derrubada (logout, ou um 401 anterior): os 401 que
		// ainda chegam são de requisições que estavam no ar, não uma sessão que
		// acabou de morrer. Levar a página embora aqui é o reload duro que
		// aparecia entre o clique em "Sair" e a tela de login — quem troca de
		// rota nesse caso é o `ProtectedRoute`, sem recarregar o documento.
		// Chave escrita à mão: `sessionKeys` mora em `services/auth`, que importa
		// este módulo.
		const sessao = queryClient.getQueryData(['session', 'get'])
		if (sessao && !sessao.user) return

		queryClient.clear()
		// `clear()` esvazia o cache em memória; sem isto o snapshot em
		// localStorage continua com os dados da sessão morta até a próxima escrita.
		persister.removeClient()

		if (!window.location.pathname.includes('/auth')) {
			// Leva o destino: a pessoa volta para a tela em que estava depois de
			// entrar de novo, em vez de cair na home.
			window.location.href = rotaDeLoginCom(window.location)
		}
		return
	}

	// Acesso negado. Um `id` fixo para o toast: uma tela que dispara três
	// consultas negadas mostrava três avisos iguais empilhados. As telas não
	// devem consultar o que o perfil não lê (ver `useHasPermission` nos
	// formulários); o 403 que chega aqui é falta de acesso de verdade.
	if (status === 403) {
		toast.error(message || 'Você não tem permissão para acessar este recurso', {
			id: 'acesso-negado',
		})
		return
	}

	// Validação
	if (status === 400) {
		toast.error(message || 'Dados inválidos.')
		return
	}

	// Conflito
	if (status === 409) {
		toast.error(message || 'Conflito nos dados.')
		return
	}

	// Erro no servidor
	if (status >= 500) {
		toast.error('Erro no servidor. Tente novamente.')
		return
	}

	// Erro de rede
	if (!status) {
		toast.error('Erro de conexão. Verifique sua internet.')
		return
	}

	// Registro fora do alcance do perfil: a tela costuma pedir o registro e
	// os blocos que dependem dele, e cada 404 virava um aviso empilhado.
	if (status === 404) {
		toast.error(message || 'Registro não localizado.', { id: 'acesso-negado' })
		return
	}

	// Erro genérico
	if (message) {
		toast.error(message)
	}
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			// Consulta que usa o 403 como resposta (a tela some com o bloco)
			// não vira aviso.
			if (query.meta?.sem403 && error?.response?.status === 403) return
			handleAuthError(error)
		},
	}),
	mutationCache: new MutationCache({
		onError: (error) => {
			handleAuthError(error)
		},
	}),
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 1, // 1 minuto
			retry: false, // Desabilitar retry automático (será controlado manualmente)
			refetchOnWindowFocus: false, // Não refetch ao voltar para tab
		},
		mutations: {
			retry: false,
		},
	},
})

export const persister = createAsyncStoragePersister({
	storage: window.localStorage,
})

export const persistOptions = {
	persister,
	dehydrateOptions: {
		// A sessão nunca é persistida. Ela é um espelho do cookie httpOnly, e o
		// cookie pode expirar ou ser revogado com a aba fechada: um espelho
		// guardado em localStorage faria o app abrir "logado" com credencial
		// morta, até alguma outra chamada tomar 401. Buscar do servidor a cada
		// carga é uma requisição — e é a única forma de a resposta ser verdade.
		shouldDehydrateQuery: (query) => !['session'].includes(query.queryKey?.[0]),
	},
}
