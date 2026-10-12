import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'src/components/ui/table'
import { useTableStateFromUrl } from 'src/hooks/use-table-state-from-url'
import { generateColumns } from './columns'
import { DataTablePagination } from './data-table-pagination'

export function GenericTable({
	data = [],
	headers = [],
	rowActions = [],
	selectableRows = false,
	pagination,
}) {
	const [rowSelection, setRowSelection] = useState({})

	// Determina o modo de paginação ANTES de chamar hooks condicionais
	const isUrlManaged = pagination?.manageUrlState === true
	const isManualPagination = !!pagination?.onPaginationChange && !isUrlManaged

	// 🚀 Hook para gerenciar paginação via URL
	// SEMPRE chamado para respeitar as regras dos hooks, mas só usado se isUrlManaged = true
	const urlPagination = useTableStateFromUrl({
		defaultPageSize: pagination?.pageSize || 10,
	})

	// Memoiza as colunas para evitar re-render loops
	const columns = useMemo(
		() => generateColumns(headers, rowActions, selectableRows),
		[headers, rowActions, selectableRows],
	)

	// Estado interno da paginação (apenas para paginação local)
	const [localPaginationState, setLocalPaginationState] = useState({
		pageIndex: 0,
		pageSize: 10,
	})

	// Sincroniza quando há paginação manual e a prop muda
	useEffect(() => {
		if (!isManualPagination && !isUrlManaged) return
		// Não faz nada aqui, apenas garante que o table será recriado quando as props mudam
	}, [
		isManualPagination,
		isUrlManaged,
		pagination?.pageIndex,
		pagination?.pageSize,
		pagination?.rowCount,
	])

	// Determina qual estado de paginação usar
	const paginationState = isUrlManaged
		? {
				pageIndex: urlPagination.pageIndex,
				pageSize: urlPagination.pageSize,
			}
		: isManualPagination
			? {
					pageIndex: pagination?.pageIndex ?? 0,
					pageSize: pagination?.pageSize ?? 10,
				}
			: localPaginationState

	// Calcula o total de páginas usando o pageSize correto do estado
	const pageCount = pagination?.rowCount
		? Math.ceil(pagination.rowCount / paginationState.pageSize)
		: undefined

	// Constrói a configuração da tabela
	const tableConfig = {
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		onRowSelectionChange: setRowSelection,
		autoResetPageIndex: false, // 🚀 Previne reset automático da página quando dados mudam
		state: {
			rowSelection,
			pagination: paginationState,
		},
	}

	// Adiciona configuração de paginação apropriada
	if (isUrlManaged) {
		// 🚀 Modo URL-managed: a tabela controla a URL internamente
		tableConfig.manualPagination = true
		tableConfig.pageCount = pageCount
		tableConfig.onPaginationChange = urlPagination.handlePaginationChange
	} else if (isManualPagination) {
		// Modo manual externo (deprecated)
		tableConfig.manualPagination = true
		tableConfig.pageCount = pageCount
		tableConfig.onPaginationChange = pagination?.onPaginationChange
	} else {
		// Modo local (client-side)
		tableConfig.getPaginationRowModel = getPaginationRowModel()
		tableConfig.onPaginationChange = setLocalPaginationState
	}

	// ✅ Hook chamado no nível superior (não dentro de useMemo/useEffect)
	const table = useReactTable(tableConfig)

	return (
		<div className='space-y-4'>
			<div className='overflow-hidden rounded-xl border border-border bg-card'>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && 'selected'}
									// Estilos condicionais
									className={`
                    ${row.original.expired ? 'bg-stripes-gray opacity-60' : ''}
                    ${row.original.highlight ? 'bg-muted/50' : ''}
                  `}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className='py-12 text-center text-muted-foreground'
								>
									Nenhum registro encontrado.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<DataTablePagination
				pageIndex={table.getState().pagination.pageIndex}
				pageSize={table.getState().pagination.pageSize}
				pageCount={table.getPageCount()}
				canPreviousPage={table.getCanPreviousPage()}
				canNextPage={table.getCanNextPage()}
				onPageChange={(newPageIndex) => table.setPageIndex(newPageIndex)}
				onPageSizeChange={(newPageSize) => table.setPageSize(newPageSize)}
			/>
		</div>
	)
}
