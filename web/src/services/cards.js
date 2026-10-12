import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from 'src/lib/axios'
import { createBaseService } from './base/createBaseService'

const BASE_URL = '/teste/cards'

// ==========================================
// 1. GERA A BASE DO SERVICE (CRUD Padrão)
// ==========================================
const baseService = createBaseService(BASE_URL, 'cards')

// Extrai o que foi gerado automaticamente
const {
	keys: cardsKeys,
	api: baseApi,
	useList: useCardsList,
	useListAll: useCardsListAll,
	useGet: useCards,
	useCreate: useCardsCreate,
	useUpdate: useCardsUpdate,
	useDelete: useCardsDelete,
} = baseService

// ==========================================
// 2. MÉTODOS CUSTOMIZADOS (Se necessário)
// ==========================================
const customApi = {
	// Exemplo: Método específico desta entidade
	exemplo: async (id, data) => {
		const response = await api.post(`${BASE_URL}/${id}/exemplo`, data)
		return response.data
	},
}

// Hooks Customizados
export function useCardsExemplo() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ id, data }) => customApi.exemplo(id, data),
		onSuccess: (data, { id }) => {
			// Invalida o cache desta entidade
			queryClient.invalidateQueries({ queryKey: cardsKeys.detail(id) })
			queryClient.invalidateQueries({ queryKey: cardsKeys.all })
		},
	})
}

// ==========================================
// 3. EXPORTS
// ==========================================

// API Methods (caso precise usar diretamente)
export const cardsService = {
	...baseApi,
	...customApi,
}

// Query Keys (útil para invalidações manuais)
export { cardsKeys }

// Hooks Base (CRUD)
export {
	useCardsList,
	useCardsListAll,
	useCards,
	useCardsCreate,
	useCardsUpdate,
	useCardsDelete,
}
