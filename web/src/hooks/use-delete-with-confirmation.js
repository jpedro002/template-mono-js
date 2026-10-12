import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

/**
 * Hook que envolve uma mutation de delete com confirmação via AlertDialog
 *
 * IMPORTANTE: A invalidação de queries é feita automaticamente pelo base service.
 * Este hook apenas gerencia o dialog de confirmação e callbacks customizados.
 *
 * @param {Object} deleteMutation - A mutation retornada por useDelete do base service
 * @param {Object} options - Opções de configuração
 * @param {string} [options.title='Confirmar exclusão'] - Título do dialog
 * @param {string} [options.description='Esta ação não pode ser desfeita. Deseja continuar?'] - Descrição
 * @param {Function} [options.getDescription] - Função para gerar descrição dinâmica baseada no item
 * @param {string} [options.confirmText='Excluir'] - Texto do botão de confirmação
 * @param {string} [options.cancelText='Cancelar'] - Texto do botão de cancelar
 * @param {Function} [options.onSuccess] - Callback executado após sucesso (toast, etc)
 * @param {Function} [options.onError] - Callback executado após erro (toast de erro, etc)
 * @param {Array} [options.queryKeyToInvalidate] - Query key adicional para invalidar (opcional)
 *
 * @returns {Object} Objeto com:
 *   - confirmDelete: Função para iniciar o processo de delete com confirmação
 *   - isOpen: Estado do dialog
 *   - onOpenChange: Função para controlar o dialog
 *   - handleConfirm: Função executada ao confirmar
 *   - handleCancel: Função executada ao cancelar
 *   - config: Configurações do dialog (title, description, etc)
 *   - isPending: Estado de loading da mutation
 *
 * @example
 * const deleteMutation = useRolesDelete()
 * const deleteConfirmation = useDeleteWithConfirmation(deleteMutation, {
 *   title: 'Excluir Role',
 *   getDescription: (role) => `Deseja excluir "${role.name}"?`,
 *   onSuccess: () => toast.success('Deletado!'),
 *   onError: (error) => toast.error(error.message)
 * })
 *
 * // No componente:
 * <Button onClick={() => deleteConfirmation.confirmDelete(role)}>
 *   Excluir
 * </Button>
 * <DeleteConfirmDialog {...deleteConfirmation} />
 */
export function useDeleteWithConfirmation(deleteMutation, options = {}) {
	const {
		title = 'Confirmar exclusão',
		description = 'Esta ação não pode ser desfeita. Deseja continuar?',
		getDescription,
		confirmText = 'Excluir',
		cancelText = 'Cancelar',
		icone,
		onSuccess,
		onError,
		queryKeyToInvalidate,
	} = options

	const queryClient = useQueryClient()
	const [isOpen, setIsOpen] = useState(false)
	const [pendingId, setPendingId] = useState(null)
	const [currentItem, setCurrentItem] = useState(null)

	/**
	 * Inicia o processo de confirmação de delete
	 * @param {string|Object} idOrItem - ID do item a deletar ou o item completo
	 */
	const confirmDelete = useCallback((idOrItem) => {
		// Suporta tanto ID quanto objeto completo
		const id = typeof idOrItem === 'object' ? idOrItem.id : idOrItem
		setPendingId(id)
		setCurrentItem(typeof idOrItem === 'object' ? idOrItem : null)
		setIsOpen(true)
	}, [])

	/**
	 * Executa o delete após confirmação
	 */
	const handleConfirm = useCallback(() => {
		if (pendingId) {
			// Não passamos onSuccess/onError aqui para deixar a mutation original executar
			// Isso garante que a invalidação de query keys aconteça corretamente
			deleteMutation.mutate(pendingId, {
				onSuccess: (data, variables, context) => {
					// A mutation original já fez a invalidação
					// Aqui apenas fechamos o dialog e executamos callbacks customizados
					setIsOpen(false)
					setPendingId(null)
					setCurrentItem(null)

					// Força refetch se uma query key específica foi fornecida
					if (queryKeyToInvalidate) {
						queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate })
					}

					// Chama o onSuccess customizado se existir
					if (onSuccess) {
						onSuccess(data, variables, context)
					}
				},
				onError: (error, variables, context) => {
					// Mantém o dialog aberto em caso de erro
					// Chama o onError customizado se existir
					if (onError) {
						onError(error, variables, context)
					}
				},
			})
		}
	}, [
		pendingId,
		deleteMutation,
		onSuccess,
		onError,
		queryKeyToInvalidate,
		queryClient,
	])

	/**
	 * Cancela o processo de delete
	 */
	const handleCancel = useCallback(() => {
		setIsOpen(false)
		setPendingId(null)
		setCurrentItem(null)
	}, [])

	/**
	 * Controla abertura/fechamento do dialog
	 */
	const onOpenChange = useCallback(
		(open) => {
			if (!open) {
				handleCancel()
			} else {
				setIsOpen(open)
			}
		},
		[handleCancel],
	)

	// Gera a descrição (pode ser dinâmica baseada no item)
	const currentDescription =
		getDescription && currentItem ? getDescription(currentItem) : description

	return {
		confirmDelete,
		isOpen,
		onOpenChange,
		handleConfirm,
		handleCancel,
		config: {
			title,
			description: currentDescription,
			confirmText,
			cancelText,
			icone,
		},
		isPending: deleteMutation.isPending,
	}
}
