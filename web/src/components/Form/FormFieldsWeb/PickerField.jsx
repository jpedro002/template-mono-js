import { Lock } from 'lucide-react'
import React from 'react'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'src/components/ui/select'
import { cn } from 'src/lib/utils'

/**
 * PickerField - Select nativo com shadcn (migrado de RN Picker)
 */

const PickerField = ({
	value,
	onChange,
	error,
	options = [],
	placeholder = 'Selecione uma opção',
	editable = true,
	className = '',
}) => {
	const pickerValue = value !== null && value !== undefined ? String(value) : ''
	const safePlaceholder =
		typeof placeholder === 'string' ? placeholder : 'Selecione uma opção'
	const errorMessage = !error
		? null
		: typeof error === 'string'
			? error
			: String(error)

	const selectedOption = options.find(
		(opt) => String(opt.value) === pickerValue,
	)
	const selectedLabel =
		selectedOption?.label && typeof selectedOption.label === 'string'
			? selectedOption.label
			: safePlaceholder

	if (!editable) {
		return (
			<div className='space-y-1.5'>
				<div
					className={cn(
						'flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3',
						className,
					)}
				>
					<span className='flex-1 text-sm text-foreground'>
						{selectedLabel}
					</span>
					<Lock className='ml-2 h-4 w-4 text-muted-foreground' />
				</div>
				{error && <p className='text-sm text-destructive'>{errorMessage}</p>}
			</div>
		)
	}

	return (
		<div className='space-y-1.5'>
			<Select value={pickerValue} onValueChange={onChange}>
				<SelectTrigger
					className={cn(
						'w-full',
						error &&
							'border-destructive bg-destructive/5 focus:ring-destructive',
						className,
					)}
				>
					<SelectValue placeholder={safePlaceholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={String(option.value)} value={String(option.value)}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{error && <p className='text-sm text-destructive'>{errorMessage}</p>}
		</div>
	)
}

export default PickerField
