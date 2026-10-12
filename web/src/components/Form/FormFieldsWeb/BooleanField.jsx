import { Lock } from 'lucide-react'
import React from 'react'
import { Button } from 'src/components/ui/button'
import { cn } from 'src/lib/utils'

/**
 * Campo booleano com labels personalizadas (migrado de RN)
 */

const BooleanField = ({
	value,
	onChange,
	labelTrue = 'Sim',
	labelFalse = 'Não',
	error,
	opcoes,
	editable = true,
	className = '',
}) => {
	const [firstOption, secondOption] =
		Array.isArray(opcoes) && opcoes.length === 2
			? opcoes
			: typeof opcoes === 'string'
				? opcoes.split(';')
				: [labelTrue, labelFalse]

	const errorMessage = !error
		? null
		: typeof error === 'string'
			? error
			: String(error)

	const isSelected = value === true || value === 'true' || value === firstOption

	if (!editable) {
		return (
			<div className={cn('space-y-1.5', className)}>
				<div className='flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3'>
					<span className='flex-1 text-sm font-semibold text-foreground'>
						{isSelected ? firstOption : secondOption}
					</span>
					<Lock className='ml-2 h-4 w-4 text-muted-foreground' />
				</div>
				{error && (
					<div className='flex items-center gap-2'>
						<div className='h-1 w-1 rounded-full bg-destructive' />
						<p className='flex-1 text-sm text-destructive'>{errorMessage}</p>
					</div>
				)}
			</div>
		)
	}

	return (
		<div className={cn('space-y-1.5', className)}>
			<div className='flex gap-3'>
				<Button
					type='button'
					variant={isSelected ? 'default' : 'outline'}
					className={`flex-1 transition-all duration-200 ${
						isSelected
							? 'ring-2 ring-primary/30 shadow-md'
							: 'hover:border-primary/40'
					}`}
					onClick={() => editable && onChange(true)}
					disabled={!editable}
				>
					{firstOption}
				</Button>
				<Button
					type='button'
					variant={
						!isSelected && value !== null && value !== undefined
							? 'default'
							: 'outline'
					}
					className={`flex-1 transition-all duration-200 ${
						!isSelected && value !== null && value !== undefined
							? 'ring-2 ring-primary/30 shadow-md'
							: 'hover:border-primary/40'
					}`}
					onClick={() => editable && onChange(false)}
					disabled={!editable}
				>
					{secondOption}
				</Button>
			</div>
			{error && (
				<div className='flex items-center gap-2'>
					<div className='h-1 w-1 rounded-full bg-destructive' />
					<p className='flex-1 text-sm text-destructive'>{errorMessage}</p>
				</div>
			)}
		</div>
	)
}

export default BooleanField
