import { api } from 'src/lib/axios'
import { createBaseService, criarUseAtivar } from './base/createBaseService'

const BASE_URL = '/seguranca/roles'

// ==========================================
// 1. GERA A BASE DO SERVICE (CRUD Padrão)
// ==========================================
const baseService = createBaseService(BASE_URL, 'roles')

// Extrai o que foi gerado automaticamente
const {
	keys: rolesKeys,
	api: baseApi,
	useList: useRolesList,
	useListAll: useRolesListAll,
	useGet: useRoles,
	useCreate: useRolesCreate,
	useUpdate: useRolesUpdate,
	useDelete: useRolesDelete,
} = baseService

// ==========================================
// 2. MÉTODOS CUSTOMIZADOS
// ==========================================

/**
 * Busca usuários de uma role específica
 * @param {string} roleId - ID da role
 * @returns {Promise<Array>} Lista de usuários
 */
const getUsersByRole = async (roleId) => {
	const response = await api.get(`${BASE_URL}/${roleId}/users`)
	return response.data
}

// ==========================================
// 3. EXPORTS
// ==========================================

// API Methods (caso precise usar diretamente)
export const rolesService = {
	...baseApi,
	getUsersByRole,
}

// Query Keys (útil para invalidações manuais)
export { rolesKeys }

// Hooks Base (CRUD)
export {
	useRolesList,
	useRolesListAll,
	useRoles,
	useRolesCreate,
	useRolesUpdate,
	useRolesDelete,
}

export const useRolesAtivar = criarUseAtivar(BASE_URL, rolesKeys)
