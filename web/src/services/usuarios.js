import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from 'src/lib/axios'
import { createBaseService, criarUseAtivar } from './base/createBaseService'

const BASE_URL = '/seguranca/usuarios'

// ==========================================
// 1. GERA A BASE DO SERVICE (CRUD Padrão)
// ==========================================
const baseService = createBaseService(BASE_URL, 'usuarios')

// Extrai o que foi gerado automaticamente
const {
	keys: usuariosKeys,
	api: baseApi,
	useList: useUsuariosList,
	useListAll: useUsuariosListAll,
	useGet: useUsuario,
	useCreate: useUsuarioCreate,
	useUpdate: useUsuarioUpdate,
	useDelete: useUsuarioDelete,
} = baseService

// ==========================================
// 2. MÉTODOS CUSTOMIZADOS
// ==========================================

/**
 * Atribuir role a usuário
 * @param {string} userId - ID do usuário
 * @param {string} roleId - ID da role
 * @param {Object} options - { assignedBy, expiresAt }
 */
const assignRole = async (userId, roleId, options = {}) => {
	const response = await api.post(
		`${BASE_URL}/${userId}/roles/${roleId}`,
		options,
	)
	return response.data
}

/**
 * Remover role de usuário
 * @param {string} userId - ID do usuário
 * @param {string} roleId - ID da role
 */
const removeRole = async (userId, roleId) => {
	await api.delete(`${BASE_URL}/${userId}/roles/${roleId}`)
}

/**
 * Atribuir permissão a usuário
 * @param {string} userId - ID do usuário
 * @param {string} permissionId - ID da permissão
 * @param {Object} options - { grantedBy, expiresAt }
 */
const grantPermission = async (userId, permissionId, options = {}) => {
	const response = await api.post(
		`${BASE_URL}/${userId}/permissions/${permissionId}`,
		options,
	)
	return response.data
}

/**
 * Remover permissão de usuário
 * @param {string} userId - ID do usuário
 * @param {string} permissionId - ID da permissão
 */
const revokePermission = async (userId, permissionId) => {
	await api.delete(`${BASE_URL}/${userId}/permissions/${permissionId}`)
}

/**
 * Redefinir senha de usuário (admin, sem senha antiga)
 * @param {string} userId - ID do usuário
 * @param {string} newPassword - Nova senha
 */
const resetPassword = async (userId, newPassword) => {
	const response = await api.post(`${BASE_URL}/${userId}/reset-password`, {
		newPassword,
	})
	return response.data
}

/**
 * Encerrar todas as sessões do usuário (admin). Todo JWT já emitido para ele
 * passa a responder 401 na próxima requisição.
 * @param {string} userId - ID do usuário
 */
const revogarSessoes = async (userId) => {
	await api.post(`${BASE_URL}/${userId}/revogar-sessoes`)
}

// ==========================================
// 3. HOOKS CUSTOMIZADOS
// ==========================================

/**
 * Hook para atribuir role
 */
export function useUsuarioAssignRole() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ userId, roleId, options }) =>
			assignRole(userId, roleId, options),
		onSuccess: (data, { userId }) => {
			queryClient.invalidateQueries({ queryKey: usuariosKeys.detail(userId) })
			queryClient.invalidateQueries({ queryKey: usuariosKeys.list() })
		},
	})
}

/**
 * Hook para remover role
 */
export function useUsuarioRemoveRole() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ userId, roleId }) => removeRole(userId, roleId),
		onSuccess: (data, { userId }) => {
			queryClient.invalidateQueries({ queryKey: usuariosKeys.detail(userId) })
			queryClient.invalidateQueries({ queryKey: usuariosKeys.list() })
		},
	})
}

/**
 * Hook para atribuir permissão
 */
export function useUsuarioGrantPermission() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ userId, permissionId, options }) =>
			grantPermission(userId, permissionId, options),
		onSuccess: (data, { userId }) => {
			queryClient.invalidateQueries({ queryKey: usuariosKeys.detail(userId) })
			queryClient.invalidateQueries({ queryKey: usuariosKeys.list() })
		},
	})
}

/**
 * Hook para remover permissão
 */
export function useUsuarioRevokePermission() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ userId, permissionId }) =>
			revokePermission(userId, permissionId),
		onSuccess: (data, { userId }) => {
			queryClient.invalidateQueries({ queryKey: usuariosKeys.detail(userId) })
			queryClient.invalidateQueries({ queryKey: usuariosKeys.list() })
		},
	})
}

/**
 * Hook para redefinir senha de usuário (admin)
 */
export function useUsuarioResetPassword() {
	return useMutation({
		mutationFn: ({ userId, newPassword }) => resetPassword(userId, newPassword),
	})
}

/**
 * Hook para encerrar as sessões de um usuário (admin)
 */
export function useUsuarioRevogarSessoes(options = {}) {
	return useMutation({
		mutationFn: (userId) => revogarSessoes(userId),
		...options,
	})
}

// ==========================================
// 4. EXPORTS
// ==========================================

// API Methods (caso precise usar diretamente)
export const usuariosService = {
	...baseApi,
	assignRole,
	removeRole,
	grantPermission,
	revokePermission,
	resetPassword,
	revogarSessoes,
}

// Query Keys (útil para invalidações manuais)
export { usuariosKeys }

export const useUsuarioAtivar = criarUseAtivar(BASE_URL, usuariosKeys)

// Hooks Base (CRUD)
export {
	useUsuariosList,
	useUsuariosListAll,
	useUsuario,
	useUsuarioCreate,
	useUsuarioUpdate,
	useUsuarioDelete,
}
