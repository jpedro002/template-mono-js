import { DropdownMenuItem } from 'src/components/ui/dropdown-menu'
import { cn } from 'src/lib/utils'

/** Item do menu da ação: ícone num quadrado, título e uma linha de contexto. */
export function ItemDoMenu({
	icone: Icone,
	titulo,
	descricao,
	destaque,
	perigo,
	...props
}) {
	return (
		<DropdownMenuItem
			className={cn(
				'items-start gap-3 rounded-md px-2 py-2',
				perigo &&
					'text-destructive focus:bg-destructive/10 focus:text-destructive',
			)}
			{...props}
		>
			<span
				className={cn(
					'flex size-8 shrink-0 items-center justify-center rounded-md border',
					destaque
						? 'border-brand-strong/30 bg-brand-light text-brand-text'
						: perigo
							? 'border-destructive/20 bg-destructive/5 text-destructive'
							: 'border-border bg-background text-muted-foreground',
				)}
			>
				<Icone className='size-4' />
			</span>
			<span className='min-w-0'>
				<span className='block font-medium text-sm leading-tight'>
					{titulo}
				</span>
				{descricao && (
					<span
						className={cn(
							'mt-0.5 block text-caption',
							perigo ? 'text-destructive/80' : 'text-muted-foreground',
						)}
					>
						{descricao}
					</span>
				)}
			</span>
		</DropdownMenuItem>
	)
}
