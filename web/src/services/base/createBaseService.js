import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from 'src/lib/axios'

/**
 * @typedef {Object} ListFilters
 * @property {number} [page=1] - Número da página (inicia em 1)
 * @property {number} [pageSize=20] - Quantidade de itens por página
 * @property {string} [term] - Termo de busca genérica
 * @property {string[]} [fields] - Campos específicos para busca do termo
 * @property {string} [order] - Campo para ordenação
 * @property {'asc'|'desc'} [orderDirection='asc'] - Direção da ordenação
 * @property {string|string[]} [fspecifics] - Filtros específicos no formato "campo$valor" (contains, ex: "nome$joão") ou "campo$=valor" (igualdade exata, ex: "status$=ativo" — necessário quando um valor válido é substring de outro, tipo "ativo" dentro de "inativo")
 * @property {string} [select] - Campos a retornar separados por vírgula (ex: "id,nome,email")
 */

/**
 * @typedef {Object} ListAllFilters
 * @property {string} [term] - Termo de busca genérica
 * @property {string[]} [fields] - Campos específicos para busca do termo
 * @property {string} [order] - Campo para ordenação
 * @property {'asc'|'desc'} [orderDirection='asc'] - Direção da ordenação
 * @property {string|string[]} [fspecifics] - Filtros específicos no formato "campo$valor"
 * @property {string} [select] - Campos a retornar separados por vírgula
 */

/**
 * @typedef {Object} GetFilters
 * @property {string} [select] - Campos a retornar separados por vírgula
 */

/**
 * @typedef {Object} PaginatedResponse
 * @property {Array} data - Array com os dados da página
 * @property {Object} pagination - Informações de paginação
 * @property {number} pagination.page - Página atual
 * @property {number} pagination.rowCount - Total de registros
 * @property {number} pagination.pageCount - Total de páginas
 */

/**
 * @typedef {Object} AllResponse
 * @property {Array} data - Array com todos os dados
 * @property {number} rowCount - Total de registros
 */

/**
 * Cria um serviço CRUD completo compatível com o BaseController do backend.
 *
 * @param {string} endpoint - A URL base do recurso (ex: '/seguranca/usuarios')
 * @param {string|string[]} queryKey - A chave base para o React Query (ex: 'usuarios')
 *
 * @returns {Object} Objeto contendo:
 *   - keys: Query keys para uso manual
 *   - api: Métodos da API (list, listAll, get, create, update, delete)
 *   - useList: Hook para listagem paginada
 *   - useListAll: Hook para listagem completa
 *   - useGet: Hook para buscar um registro
 *   - useCreate: Hook para criar registro
 *   - useUpdate: Hook para atualizar registro
 *   - useDelete: Hook para deletar registro
 *
 * @example
 * const baseService = createBaseService('/api/produtos', 'produtos')
 * const { useList, useCreate } = baseService
 *
 * // Uso no componente
 * const { data } = useList({ page: 1, pageSize: 10, term: 'notebook' })
 * const createMutation = useCreate()
 */
export function createBaseService(endpoint, queryKey) {
	// Garante que a key seja um array para consistência
	const entityKey = Array.isArray(queryKey) ? queryKey : [queryKey]

	// ==========================================
	// 1. QUERY KEYS
	// ==========================================
	const keys = {
		all: entityKey,
		list: (filters = {}) => [...keys.all, 'list', filters],
		listAll: (filters = {}) => [...keys.all, 'all-list', filters],
		detail: (id, filters) =>
			filters
				? [...keys.all, 'detail', id, filters]
				: [...keys.all, 'detail', id],
	}

	// ==========================================
	// 2. API METHODS (Axios)
	// ==========================================
	const apiMethods = {
		/**
		 * Lista registros com paginação (Match com baseController.fetch)
		 *
		 * @param {ListFilters} [filters={}] - Filtros de busca e paginação
		 * @returns {Promise<PaginatedResponse>} Dados paginados
		 *
		 * @example
		 * const result = await api.list({
		 *   page: 1,
		 *   pageSize: 10,
		 *   term: 'João',
		 *   fspecifics: 'ativo$true',
		 *   select: 'id,nome,email'
		 * })
		 */
		list: async (filters = {}) => {
			// Repassamos todos os filtros diretamente.
			// O axios serializa objetos simples. Arrays como 'fields' são tratados automaticamente.
			const response = await api.get(endpoint, { params: filters })
			return response.data
		},

		/**
		 * Lista TODOS os registros sem paginação (Match com baseController.all)
		 *
		 * @param {ListAllFilters} [filters={}] - Filtros de busca (sem paginação)
		 * @returns {Promise<AllResponse>} Todos os dados
		 *
		 * @example
		 * const result = await api.listAll({
		 *   term: 'admin',
		 *   order: 'nome',
		 *   orderDirection: 'asc'
		 * })
		 */
		listAll: async (filters = {}) => {
			const response = await api.get(`${endpoint}/all`, { params: filters })
			return response.data
		},

		/**
		 * Busca um registro específico por ID
		 *
		 * @param {string} id - ID do registro
		 * @param {GetFilters} [filters={}] - Filtros opcionais (select)
		 * @returns {Promise<Object>} Registro encontrado
		 *
		 * @example
		 * const user = await api.get('123', { select: 'id,nome,email' })
		 */
		get: async (id, filters = {}) => {
			const response = await api.get(`${endpoint}/${id}`, { params: filters })
			return response.data
		},

		/**
		 * Cria um novo registro
		 *
		 * @param {Object} data - Dados do novo registro
		 * @returns {Promise<Object>} Registro criado
		 *
		 * @example
		 * const newUser = await api.create({ nome: 'João', email: 'joao@email.com' })
		 */
		create: async (data) => {
			const response = await api.post(endpoint, data)
			return response.data
		},

		/**
		 * Atualiza um registro existente
		 *
		 * @param {string} id - ID do registro
		 * @param {Object} data - Dados para atualização
		 * @param {Object} [filters={}] - Query da rota (o `incluir_inativas` que
		 *   a tela de edição usou para alcançar o registro; sem ele o PUT volta
		 *   ao filtro padrão e responde 404 ao salvar)
		 * @returns {Promise<Object>} Registro atualizado
		 *
		 * @example
		 * const updated = await api.update('123', { nome: 'João Silva' })
		 */
		update: async (id, data, filters = {}) => {
			const response = await api.put(`${endpoint}/${id}`, data, {
				params: filters,
			})
			return response.data
		},

		/**
		 * Deleta um registro
		 *
		 * @param {string} id - ID do registro a deletar
		 * @returns {Promise<void>}
		 *
		 * @example
		 * await api.delete('123')
		 */
		delete: async (id) => {
			await api.delete(`${endpoint}/${id}`)
		},
	}

	// ==========================================
	// 3. HOOKS (React Query)
	// ==========================================
	const hooks = {
		/**
		 * Hook para listagem paginada de registros
		 *
		 * @param {ListFilters} [filters={}] - Filtros de busca e paginação
		 * @param {Object} [options={}] - Opções do React Query (staleTime, enabled, etc)
		 * @returns {import('@tanstack/react-query').UseQueryResult<PaginatedResponse>}
		 *
		 * @example
		 * // Uso básico
		 * const { data, isLoading } = useList({ page: 1, pageSize: 10 })
		 *
		 * @example
		 * // Com filtros avançados
		 * const { data } = useList({
		 *   page: 1,
		 *   pageSize: 20,
		 *   term: 'João',
		 *   fields: ['nome', 'email'],
		 *   order: 'createdAt',
		 *   orderDirection: 'desc',
		 *   fspecifics: ['ativo$true', 'role$admin'],
		 *   select: 'id,nome,email,ativo'
		 * })
		 *
		 * @example
		 * // Com opções do React Query
		 * const { data } = useList(
		 *   { page: 1, pageSize: 10 },
		 *   { staleTime: 60000, enabled: isAuthenticated }
		 * )
		 */
		useList: (filters = {}, options = {}) => {
			return useQuery({
				queryKey: keys.list(filters),
				queryFn: () => apiMethods.list(filters),
				placeholderData: (prev) => prev, // Mantém dados anteriores enquanto carrega novos (UX melhor na paginação)
				staleTime: 1000 * 60 * 5,
				...options,
			})
		},

		/**
		 * Hook para listar TODOS os registros sem paginação
		 *
		 * @param {ListAllFilters} [filters={}] - Filtros de busca (sem paginação)
		 * @param {Object} [options={}] - Opções do React Query
		 * @returns {import('@tanstack/react-query').UseQueryResult<AllResponse>}
		 *
		 * @example
		 * // Listar tudo para um select/dropdown
		 * const { data: usuarios } = useListAll()
		 *
		 * @example
		 * // Com filtros
		 * const { data: ativos } = useListAll({
		 *   fspecifics: 'ativo$true',
		 *   order: 'nome',
		 *   select: 'id,nome'
		 * })
		 *
		 * @example
		 * // Desabilitado até uma condição
		 * const { data } = useListAll(
		 *   { term: searchTerm },
		 *   { enabled: searchTerm.length > 2 }
		 * )
		 */
		useListAll: (filters = {}, options = {}) => {
			return useQuery({
				queryKey: keys.listAll(filters),
				queryFn: () => apiMethods.listAll(filters),
				staleTime: 1000 * 60 * 5,
				...options,
			})
		},

		/**
		 * Hook para obter um registro específico por ID
		 *
		 * @param {string} id - ID do registro
		 * @param {Object} [options={}] - Opções do React Query
		 * @param {GetFilters} [options.filters] - Filtros opcionais (select)
		 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
		 *
		 * @example
		 * // Buscar por ID
		 * const { data: usuario, isLoading } = useGet('123')
		 *
		 * @example
		 * // Com select de campos
		 * const { data } = useGet('123', {
		 *   filters: { select: 'id,nome,email' }
		 * })
		 *
		 * @example
		 * // Condicional (ex: edição)
		 * const { id } = useParams()
		 * const { data } = useGet(id, { enabled: id !== 'new' })
		 */
		useGet: (id, options = {}) => {
			const { filters, ...queryOptions } = options
			return useQuery({
				queryKey: keys.detail(id, filters),
				queryFn: () => apiMethods.get(id, filters),
				enabled: !!id,
				staleTime: 1000 * 60 * 5,
				...queryOptions,
			})
		},

		/**
		 * Hook para criar um novo registro
		 *
		 * @param {Object} [options={}] - Opções do React Query (onSuccess, onError, etc)
		 * @returns {import('@tanstack/react-query').UseMutationResult}
		 *
		 * @example
		 * // Uso básico
		 * const createMutation = useCreate()
		 * createMutation.mutate({ nome: 'João', email: 'joao@email.com' })
		 *
		 * @example
		 * // Com callbacks
		 * const createMutation = useCreate({
		 *   onSuccess: (data) => {
		 *     toast.success('Criado com sucesso!')
		 *     navigate(`/usuarios/${data.id}`)
		 *   },
		 *   onError: (error) => {
		 *     toast.error(error.message)
		 *   }
		 * })
		 *
		 * @example
		 * // Em formulário
		 * const handleSubmit = (formData) => {
		 *   createMutation.mutate(formData)
		 * }
		 */
		useCreate: (options = {}) => {
			const queryClient = useQueryClient()
			return useMutation({
				...options,
				mutationFn: apiMethods.create,
				onSuccess: (data, variables, context) => {
					// Invalida qualquer lista dessa entidade
					queryClient.invalidateQueries({ queryKey: keys.all })
					options.onSuccess?.(data, variables, context)
				},
			})
		},

		/**
		 * Hook para atualizar um registro existente
		 *
		 * @param {Object} [options={}] - Opções do React Query
		 * @param {Object} [options.filters] - Query da rota, no mesmo formato do
		 *   `useGet`. A tela que abriu um registro inativo repete aqui o
		 *   `incluir_inativas`/`incluir_inativos` que usou para carregá-lo.
		 * @returns {import('@tanstack/react-query').UseMutationResult}
		 *
		 * @example
		 * // Uso básico
		 * const updateMutation = useUpdate()
		 * updateMutation.mutate({
		 *   id: '123',
		 *   data: { nome: 'João Silva' }
		 * })
		 *
		 * @example
		 * // Com callbacks
		 * const updateMutation = useUpdate({
		 *   onSuccess: (data, { id }) => {
		 *     toast.success('Atualizado!')
		 *     navigate(`/usuarios/${id}`)
		 *   }
		 * })
		 *
		 * @example
		 * // Em formulário de edição
		 * const { id } = useParams()
		 * const handleSubmit = (formData) => {
		 *   updateMutation.mutate({ id, data: formData })
		 * }
		 */
		useUpdate: (options = {}) => {
			const queryClient = useQueryClient()
			const { filters, ...mutationOptions } = options
			return useMutation({
				...mutationOptions,
				mutationFn: ({ id, data }) => apiMethods.update(id, data, filters),
				onSuccess: (data, variables, context) => {
					// Invalida o detalhe específico
					queryClient.invalidateQueries({ queryKey: keys.detail(variables.id) })
					// Invalida as listas para atualizar dados na tabela
					queryClient.invalidateQueries({ queryKey: keys.all })

					options.onSuccess?.(data, variables, context)
				},
			})
		},

		/**
		 * Hook para deletar um registro
		 *
		 * IMPORTANTE: Para adicionar confirmação de exclusão, use o hook useDeleteWithConfirmation:
		 *
		 * @param {Object} [options={}] - Opções do React Query
		 * @returns {import('@tanstack/react-query').UseMutationResult}
		 *
		 * @example
		 * // ✅ RECOMENDADO: Com confirmação via AlertDialog
		 * import { useDeleteWithConfirmation } from 'src/hooks/use-delete-with-confirmation'
		 * import { DeleteConfirmDialog } from 'src/components/delete-confirm-dialog'
		 *
		 * const deleteMutation = useUsuariosDelete()
		 * const deleteConfirmation = useDeleteWithConfirmation(deleteMutation, {
		 *   title: 'Excluir Usuário',
		 *   description: 'Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.',
		 *   confirmText: 'Sim, excluir',
		 *   cancelText: 'Cancelar'
		 * })
		 *
		 * // No JSX:
		 * <Button
		 *   variant="destructive"
		 *   onClick={() => deleteConfirmation.confirmDelete(usuario.id)}
		 * >
		 *   Excluir
		 * </Button>
		 * <DeleteConfirmDialog {...deleteConfirmation} />
		 *
		 * @example
		 * // Com descrição dinâmica baseada no item
		 * const deleteConfirmation = useDeleteWithConfirmation(deleteMutation, {
		 *   title: 'Excluir Usuário',
		 *   getDescription: (item) => `Deseja excluir o usuário "${item.nome}"?`,
		 * })
		 *
		 * // Passar o objeto completo
		 * <Button onClick={() => deleteConfirmation.confirmDelete(usuario)}>
		 *   Excluir
		 * </Button>
		 *
		 * @example
		 * // ⚠️  Uso direto (sem confirmação - não recomendado)
		 * const deleteMutation = useDelete()
		 * deleteMutation.mutate('123')
		 *
		 * @example
		 * // Com callbacks personalizados
		 * const deleteMutation = useDelete({
		 *   onSuccess: () => {
		 *     toast.success('Deletado com sucesso!')
		 *     navigate('/usuarios')
		 *   },
		 *   onError: (error) => {
		 *     toast.error(`Erro ao deletar: ${error.message}`)
		 *   }
		 * })
		 *
		 * @example
		 * // Em ações de tabela (GenericTable)
		 * const actions = [
		 *   {
		 *     label: 'Editar',
		 *     icon: Edit,
		 *     to: (row) => `/usuarios/${row.id}`,
		 *   },
		 *   {
		 *     label: 'Excluir',
		 *     icon: Trash2,
		 *     variant: 'destructive',
		 *     onClick: (row) => deleteConfirmation.confirmDelete(row),
		 *   }
		 * ]
		 */
		useDelete: (options = {}) => {
			const queryClient = useQueryClient()
			return useMutation({
				...options,
				mutationFn: apiMethods.delete,
				onSuccess: (data, variables, context) => {
					queryClient.invalidateQueries({ queryKey: keys.all })
					options.onSuccess?.(data, variables, context)
				},
			})
		},
	}

	return {
		keys,
		api: apiMethods,
		...hooks, // Espalha os hooks (useList, useCreate, etc)
	}
}

/**
 * Reativa um registro inativado — `PATCH /<recurso>/:id/ativar`.
 *
 * A outra metade do interruptor `DELETE /adm/cadastro/<recurso>/ativar/{id}` do
 * painel anterior, que apagava ou restaurava conforme o estado da linha. Aqui
 * inativar é o `useXDelete` que o serviço base já gera e reativar é este.
 *
 * É uma fábrica porque são doze recursos com o mesmo `PATCH`; a função
 * devolvida é que é o hook, e é ela que ganha o nome `useXAtivar` no export.
 * Mora aqui, e não em `organizacao.js` onde nasceu, porque segurança passou a
 * usá-la — importar de organização faria o serviço de usuário depender do
 * domínio errado.
 *
 * @param {string} endpoint
 * @param {{all: Array}} keys
 */
export function criarUseAtivar(endpoint, keys) {
	return function useAtivar(options = {}) {
		const queryClient = useQueryClient()

		return useMutation({
			...options,
			mutationFn: async (id) =>
				(await api.patch(`${endpoint}/${id}/ativar`)).data,
			onSuccess: (data, variables, context) => {
				queryClient.invalidateQueries({ queryKey: keys.all })
				options.onSuccess?.(data, variables, context)
			},
		})
	}
}
