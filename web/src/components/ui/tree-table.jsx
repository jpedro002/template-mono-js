import { cn } from 'src/lib/utils'

/**
 * A coluna de conectores das tabelas em árvore (procedimento pai → corretivo).
 *
 * As linhas se ligam sozinhas porque o pai desenha do meio da célula até a
 * borda de baixo e o filho desenha da borda de cima até o meio: células
 * vizinhas na mesma coluna não têm vão entre si. O último filho para no meio,
 * o que fecha o ramo.
 */
export function TreeGutterHead({ className, ...props }) {
	return (
		<th aria-hidden className={cn('w-10 shrink-0 p-2', className)} {...props} />
	)
}

export function TreeGutterCellEmpty({ className, ...props }) {
	return (
		<td aria-hidden className={cn('w-10 shrink-0 p-2', className)} {...props} />
	)
}

export function TreeGutterCellParent({ className, isExpanded, ...props }) {
	return (
		<td
			aria-hidden
			className={cn('relative w-10 shrink-0 p-2 align-top', className)}
			{...props}
		>
			{isExpanded && (
				<span
					aria-hidden
					className='absolute top-1/2 bottom-0 left-1/2 z-0 w-0.5 -translate-x-1/2 bg-brand/40'
				/>
			)}
			<div className='absolute inset-0 z-10 flex items-center justify-center'>
				<span className='size-2.5 shrink-0 rounded-full bg-brand' />
			</div>
		</td>
	)
}

export function TreeGutterCellChild({ className, isLast, ...props }) {
	return (
		<td
			aria-hidden
			className={cn('relative w-10 shrink-0 p-2', className)}
			{...props}
		>
			<span
				className={cn(
					'absolute left-1/2 w-0.5 -translate-x-1/2 bg-brand/40',
					isLast ? 'top-0 bottom-1/2' : 'top-0 bottom-0',
				)}
			/>
			<span className='absolute top-1/2 right-0 left-1/2 h-0.5 -translate-y-1/2 bg-brand/40' />
		</td>
	)
}
