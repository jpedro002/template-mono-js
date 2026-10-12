import { Lock } from 'lucide-react'
import React from 'react'
import { Input } from 'src/components/ui/input'
import { cn } from 'src/lib/utils'

/**
 * Campo de moeda com formatação BRL (migrado de RN)
 */

// Formata valor como moeda brasileira
const formatCurrency = (text) => {
	const numbers = text.replace(/\D/g, '')
	const value = parseInt(numbers || '0', 10)
	const formatted = (value / 100).toLocaleString('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	})
	return formatted
}

const CurrencyField = ({
	value,
	onChange,
	error,
	editable = true,
	className = '',
}) => {
	const errorMessage = !error
		? null
		: typeof error === 'string'
			? error
			: String(error)

	const handleCurrencyChange = (e) => {
		if (editable) {
			const formatted = formatCurrency(e.target.value)
			onChange(formatted)
		}
	}

	if (!editable) {
		return (
			<div className='space-y-1.5'>
				<div
					className={cn(
						'flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3',
						className,
					)}
				>
					<span className='flex-1 text-base font-semibold text-foreground'>
						{value || 'R$ 0,00'}
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
		<div className='space-y-1.5'>
			<Input
				value={value || 'R$ 0,00'}
				onChange={handleCurrencyChange}
				placeholder='R$ 0,00'
				className={cn(
					'text-base font-semibold',
					error &&
						'border-destructive bg-destructive/5 focus-visible:ring-destructive',
					className,
				)}
			/>

			{error && (
				<div className='flex items-center gap-2'>
					<div className='h-1 w-1 rounded-full bg-destructive' />
					<p className='flex-1 text-sm text-destructive'>{errorMessage}</p>
				</div>
			)}
		</div>
	)
}

export default CurrencyField
