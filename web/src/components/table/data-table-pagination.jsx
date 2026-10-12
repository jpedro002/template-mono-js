import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from 'lucide-react'

import { Button } from 'src/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'src/components/ui/select'

export function DataTablePagination({
	pageIndex = 0,
	pageSize = 10,
	pageCount = 0,
	canPreviousPage = false,
	canNextPage = false,
	onPageChange,
	onPageSizeChange,
}) {
	return (
		<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2 py-4'>
			<div className='flex items-center gap-2 sm:gap-4 lg:gap-6 flex-wrap sm:flex-nowrap'>
				{/* Seletor de Linhas por Página */}
				<div className='flex items-center gap-2'>
					<p className='text-xs sm:text-sm font-medium whitespace-nowrap'>
						Linhas:
					</p>
					<Select
						value={`${pageSize}`}
						onValueChange={(value) => {
							onPageSizeChange?.(Number(value))
						}}
					>
						<SelectTrigger className='h-8 w-16 sm:w-[70px]'>
							<SelectValue placeholder={pageSize} />
						</SelectTrigger>
						<SelectContent side='top'>
							{[5, 10, 20, 30, 40, 50].map((size) => (
								<SelectItem key={size} value={`${size}`}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Indicador de Página */}
				<div className='text-xs sm:text-sm font-medium whitespace-nowrap'>
					<span className='hidden sm:inline'>Página </span>
					<span>{pageIndex + 1}</span>
					<span className='hidden sm:inline'> de {pageCount}</span>
					<span className='sm:hidden'>/{pageCount}</span>
				</div>
			</div>

			{/* Controles de Navegação */}
			<div className='flex items-center gap-1 sm:gap-2'>
				<Button
					variant='outline'
					className='hidden h-8 w-8 p-0 lg:flex'
					onClick={() => onPageChange?.(0)}
					disabled={!canPreviousPage}
					title='Primeira página'
				>
					<span className='sr-only'>Ir para primeira página</span>
					<ChevronsLeft className='h-4 w-4' />
				</Button>
				<Button
					variant='outline'
					className='h-8 w-8 p-0'
					onClick={() => onPageChange?.(pageIndex - 1)}
					disabled={!canPreviousPage}
					title='Página anterior'
				>
					<span className='sr-only'>Ir para página anterior</span>
					<ChevronLeft className='h-4 w-4' />
				</Button>
				<Button
					variant='outline'
					className='h-8 w-8 p-0'
					onClick={() => onPageChange?.(pageIndex + 1)}
					disabled={!canNextPage}
					title='Próxima página'
				>
					<span className='sr-only'>Ir para próxima página</span>
					<ChevronRight className='h-4 w-4' />
				</Button>
				<Button
					variant='outline'
					className='hidden h-8 w-8 p-0 lg:flex'
					onClick={() => onPageChange?.(pageCount - 1)}
					disabled={!canNextPage}
					title='Última página'
				>
					<span className='sr-only'>Ir para última página</span>
					<ChevronsRight className='h-4 w-4' />
				</Button>
			</div>
		</div>
	)
}
