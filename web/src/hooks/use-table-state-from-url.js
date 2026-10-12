import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Hook customizado para gerenciar estado de paginação através da URL
 *
 * @param {Object} options - Opções de configuração
 * @param {number} options.defaultPageSize - Tamanho padrão da página (default: 10)
 * @returns {Object} Objeto com pageIndex, pageSize e handlePaginationChange
 */
export function useTableStateFromUrl({ defaultPageSize = 10 } = {}) {
	const [searchParams, setSearchParams] = useSearchParams()

	// Lê os parâmetros da URL
	const page = Number(searchParams.get('page')) || 1
	const pageSize = Number(searchParams.get('pageSize')) || defaultPageSize

	// Converte para 0-indexed (React Table usa 0-index)
	const pageIndex = page - 1

	// Função para atualizar a URL quando a paginação muda
	const handlePaginationChange = useCallback(
		(updaterOrValue) => {
			setSearchParams(
				(prev) => {
					// Lê os valores atuais da URL dentro da função
					const currentPage = Number(prev.get('page')) || 1
					const currentPageSize =
						Number(prev.get('pageSize')) || defaultPageSize
					const currentPageIndex = currentPage - 1

					// TanStack Table pode passar uma função updater ou um valor direto
					const newPagination =
						typeof updaterOrValue === 'function'
							? updaterOrValue({
									pageIndex: currentPageIndex,
									pageSize: currentPageSize,
								})
							: updaterOrValue

					const next = new URLSearchParams(prev)
					next.set('page', String((newPagination.pageIndex ?? 0) + 1)) // Converte de 0-index para 1-index
					next.set(
						'pageSize',
						String(newPagination.pageSize ?? currentPageSize),
					)
					return next
				},
				{ replace: true },
			)
		},
		[setSearchParams, defaultPageSize],
	)

	return {
		pageIndex,
		pageSize,
		page, // Retorna também a versão 1-indexed para uso na API
		handlePaginationChange,
	}
}
