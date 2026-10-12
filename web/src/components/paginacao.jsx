import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from 'src/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'src/components/ui/select'

/** Cinco botões de página, deslizando em volta da atual. */
function paginasVisiveis(atual, total) {
	const quantas = Math.min(5, total)
	const inicio = Math.max(1, Math.min(atual - 2, total - quantas + 1))
	return Array.from({ length: quantas }, (_, i) => inicio + i)
}

/**
 * Rodapé de paginação das listas em cartão — o mesmo do Executar Ação.
 * Páginas começam em 1.
 */
export function Paginacao({
	pagina,
	porPagina,
	total,
	totalPaginas,
	onPagina,
	onPorPagina,
	opcoes = [10, 20, 50, 100],
}) {
	if (!total) return null

	const primeiro = (pagina - 1) * porPagina + 1
	const ultimo = Math.min(pagina * porPagina, total)

	return (
		<div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
			<div className='flex items-center gap-2'>
				<span className='text-muted-foreground text-sm'>
					Mostrando {primeiro} a {ultimo} de {total.toLocaleString('pt-BR')}
				</span>
				<Select
					value={String(porPagina)}
					onValueChange={(v) => onPorPagina(Number(v))}
				>
					<SelectTrigger className='w-[90px]' aria-label='Itens por página'>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{opcoes.map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{totalPaginas > 1 && (
				<div className='flex items-center gap-2'>
					<Button
						variant='outline'
						size='sm'
						disabled={pagina <= 1}
						onClick={() => onPagina(pagina - 1)}
					>
						<ChevronLeft className='size-4' />
						Anterior
					</Button>
					<div className='hidden items-center gap-1 sm:flex'>
						{paginasVisiveis(pagina, totalPaginas).map((n) => (
							<Button
								key={n}
								variant={n === pagina ? 'default' : 'outline'}
								size='sm'
								className='w-10'
								onClick={() => onPagina(n)}
							>
								{n}
							</Button>
						))}
					</div>
					<Button
						variant='outline'
						size='sm'
						disabled={pagina >= totalPaginas}
						onClick={() => onPagina(pagina + 1)}
					>
						Próxima
						<ChevronRight className='size-4' />
					</Button>
				</div>
			)}
		</div>
	)
}
