import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from 'src/lib/axios'
import { sessionKeys } from 'src/services/auth'

/**
 * Perfil do próprio usuário — as rotas que operam sobre o `id` do token, não
 * sobre um `:id` do path.
 *
 * Nenhuma delas exige permissão de domínio na API: o recorte pelo próprio
 * usuário *é* a autorização. Cobrar `usuarios:read` aqui daria 403 em
 * quem não gerencia usuários — e todo mundo abre a tela de perfil.
 *
 * A fonte é o `GET /usuarios/perfil`; o cache do React Query é o
 * único lugar onde ele vive, e toda escrita o invalida junto com a sessão (o
 * nome aparece no menu lateral).
 */
const BASE_URL = '/seguranca/usuarios'
const AUTH_URL = '/seguranca/auth'

export const perfilKeys = {
	all: ['perfil'],
	get: () => [...perfilKeys.all, 'get'],
}

export function usePerfil(options = {}) {
	return useQuery({
		queryKey: perfilKeys.get(),
		queryFn: async () => (await api.get(`${BASE_URL}/perfil`)).data,
		staleTime: 1000 * 60,
		...options,
	})
}

/**
 * Só `name` e `phone`: a API recusa o corpo com qualquer outra chave
 * (`strict`), de propósito — mandar `password` aqui e vê-lo descartado em
 * silêncio deixaria o usuário achando que trocou a senha sem ter trocado.
 */
export function useAtualizarPerfil() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (dados) =>
			(await api.put(`${BASE_URL}/perfil`, dados)).data,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: perfilKeys.all })
			queryClient.invalidateQueries({ queryKey: sessionKeys.all })
		},
	})
}

/**
 * Confere a senha atual sem trocar nada — é o que libera os campos da tela de
 * segurança. Devolve `{ valida: boolean }`: senha errada é resposta de negócio,
 * não 401, então não cai no handler global que desloga.
 */
export function useConferirSenha() {
	return useMutation({
		mutationFn: async (password) =>
			(await api.post(`${BASE_URL}/check-password`, { password })).data,
	})
}

export function useTrocarSenha() {
	return useMutation({
		mutationFn: async ({ oldPassword, newPassword }) =>
			(
				await api.post(`${BASE_URL}/update-password`, {
					oldPassword,
					newPassword,
				})
			).data,
	})
}

/**
 * Pede a troca do e-mail. O link de confirmação vai para o **novo** endereço.
 *
 * Exige a senha atual — o sistema anterior não exigia, e sem ela uma sessão
 * sequestrada troca o e-mail da conta e o dono perde o caminho de recuperação.
 * Por isso o diálogo da tela pede senha, e não só o novo endereço.
 */
export function useSolicitarTrocaEmail() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ novoEmail, senha }) =>
			(
				await api.post(`${AUTH_URL}/email/change/request`, {
					new_email: novoEmail,
					password: senha,
				})
			).data,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: perfilKeys.all }),
	})
}

export function useCancelarTrocaEmail() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () =>
			(await api.post(`${AUTH_URL}/email/change/cancel`)).data,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: perfilKeys.all }),
	})
}

/**
 * Reenvia a confirmação do e-mail **atual**, para quem tem `emailVerifiedAt`
 * nulo — toda conta migrada nasceu assim, e a tela de segurança exige e-mail
 * verificado antes de deixar trocar a senha.
 *
 * Não passa endereço nem senha: o destino é o que já está na conta e nada muda
 * até o clique no link.
 */
export function useEnviarVerificacaoEmail() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () =>
			(await api.post(`${AUTH_URL}/email/verify/request`)).data,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: perfilKeys.all }),
	})
}

/**
 * Confirma o token do e-mail. Rota **pública**: o link é aberto no cliente de
 * e-mail, que pode não ser o browser da sessão.
 */
export function useConfirmarEmail() {
	return useMutation({
		mutationFn: async (token) =>
			(await api.post(`${AUTH_URL}/email/change/confirm`, { token })).data,
	})
}
