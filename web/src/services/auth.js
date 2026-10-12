import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from 'src/lib/axios'
import { persister } from 'src/lib/react-query'

/**
 * Autenticação por **cookie httpOnly**, não por token no localStorage.
 *
 * A API assina o JWT e grava em cookie no `POST /auth/session`; o corpo
 * da resposta não devolve o token e o JS nunca o enxerga. Consequências:
 *
 * - não há nada para guardar, mandar em `Authorization` nem limpar no logout;
 * - "estou logado?" não é um flag local, é o que `GET /auth/session` responde —
 *   cookie expirado deixa de ser sessão na hora, sem o front achar o contrário;
 * - só o servidor apaga o cookie, então logout é `DELETE /auth/session`. O
 *   código anterior chamava `POST /auth/logout`, rota que não existe: dava 404,
 *   o cookie continuava válido e o usuário seguia logado ao voltar.
 *
 * `withCredentials: true` no axios (`src/lib/axios.js`) e a origem do web em
 * `CORS_ORIGIN` na API são pré-requisitos — sem os dois o browser não
 * manda o cookie.
 */
const BASE_URL = '/seguranca/auth'

export const sessionKeys = {
	all: ['session'],
	get: () => [...sessionKeys.all, 'get'],
}

export const SEM_SESSAO = { user: null }

/**
 * Chave de localStorage usada só como aviso entre abas: o evento `storage`
 * dispara nas **outras** abas da origem, e é isso que faz a aba parada cair na
 * hora em que qualquer uma sai. Sem ela, a aba que não clicou continuaria
 * mostrando a tela protegida com o cache até alguma query vencer — o cookie já
 * não vale, mas ninguém tinha perguntado.
 */
export const CHAVE_LOGOUT = 'sessao:encerrada'

const authService = {
	login: async (credentials) => {
		const { data } = await api.post(`${BASE_URL}/session`, credentials)
		return { user: data.user }
	},

	getSession: async () => {
		try {
			const { data } = await api.get(`${BASE_URL}/session`)
			return { user: data.usuario }
		} catch (erro) {
			// 401 aqui é a resposta normal de quem ainda não entrou. Deixar
			// propagar acionaria o handler global e jogaria em `/auth` quem já
			// está em `/auth`.
			if (erro?.response?.status === 401) return SEM_SESSAO
			throw erro
		}
	},

	logout: () => api.delete(`${BASE_URL}/session`),

	/**
	 * Pede o link de redefinição. A API responde igual para e-mail cadastrado e
	 * não cadastrado — a tela não tem como (nem deve) distinguir os dois.
	 */
	forgotPassword: async (email) => {
		const { data } = await api.post(`${BASE_URL}/forgot-password`, { email })
		return data
	},

	resetPassword: async (dados) => {
		const { data } = await api.post(`${BASE_URL}/reset-password`, dados)
		return data
	},
}

/**
 * Sessão atual. Sempre habilitada: o cookie é a fonte da verdade e só o
 * servidor sabe se ainda vale.
 */
export function useSession() {
	return useQuery({
		queryKey: sessionKeys.get(),
		queryFn: authService.getSession,
		staleTime: 5 * 60 * 1000,
		retry: false,
		// O cookie pode morrer sem o app saber — expirou, foi revogado, ou outra
		// aba saiu. Voltar para a aba é o momento em que a pessoa vai agir sobre a
		// tela, então é aí que se pergunta de novo. `'always'` porque o
		// `staleTime` de 5 min engoliria o refetch justamente na janela em que a
		// sessão costuma cair.
		refetchOnWindowFocus: 'always',
	})
}

export function useLogin() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: authService.login,
		onSuccess: (sessao) => {
			// Escrever direto evita a janela sem sessão entre o login e o GET —
			// nela o `ProtectedRoute` chutaria de volta para `/auth`. O invalidate
			// logo atrás busca a forma canônica (`GET /session` traz `active` e as
			// datas, que o corpo do login não devolve) sem apagar o que já está lá.
			queryClient.setQueryData(sessionKeys.get(), sessao)
			queryClient.invalidateQueries({ queryKey: sessionKeys.all })
		},
	})
}

export function useForgotPassword() {
	return useMutation({ mutationFn: authService.forgotPassword })
}

export function useResetPassword() {
	return useMutation({ mutationFn: authService.resetPassword })
}

export function useLogout() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: authService.logout,
		// Antes do DELETE, não depois. Enquanto a sessão local não cai a árvore
		// protegida segue montada: limpando o cache só no fim, as queries dessa
		// árvore refaziam a busca já sem cookie, tomavam 401 e o handler global
		// levava a página embora com `window.location` — era esse o reload duro
		// entre o clique em "Sair" e a tela de login. Derrubando a sessão
		// primeiro, a árvore desmonta e não há o que refazer.
		//
		// Se o DELETE falhar a sessão local cai do mesmo jeito. O contrário —
		// front achando que continua logado — é pior.
		onMutate: () => {
			// A query da sessão **não** entra na remoção: o observer do
			// `AuthProvider` está preso ao objeto dela. `removeQueries` destrói
			// esse objeto e o `setQueryData` seguinte cria outro, que ninguém
			// observa — o contexto continuava com o usuário antigo (daí `/auth`
			// devolver para a tela inicial no logout) e o login seguinte escrevia numa
			// query órfã, deixando a tela de login parada com o POST em 200.
			// O resto sai: o cache é persistido em localStorage e as respostas de
			// quem saiu sobreviveriam ao logout, em máquina compartilhada.
			queryClient.removeQueries({
				predicate: (query) => query.queryKey?.[0] !== 'session',
			})
			queryClient.setQueryData(sessionKeys.get(), SEM_SESSAO)
			// `removeQueries` só mexe na memória: a escrita do persister é
			// debounced e o snapshot em localStorage ficaria com as respostas do
			// usuário que saiu.
			persister.removeClient()
			// Avisa as outras abas (ver `CHAVE_LOGOUT`).
			localStorage.setItem(CHAVE_LOGOUT, String(Date.now()))
		},
	})
}

export { authService }
