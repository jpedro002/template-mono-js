import { Check, ChevronsUpDown, Lock, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from 'src/components/ui/badge'
import { Button } from 'src/components/ui/button'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from 'src/components/ui/command'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from 'src/components/ui/dialog'
import { cn } from 'src/lib/utils'

/**
 * SearchPickerField - Componente de seleção com busca (migrado de RN)
 */

const SearchPickerField = ({
	value,
	onChange,
	error,
	label,
	options = [],
	placeholder = 'Selecione uma opção',
	editable = true,
	searchable = true,
	searchPlaceholder = 'Buscar...',
	multiSelect = false,
	emptyMessage = 'Nenhuma opção encontrada',
	onSearchChange = null,
	// Quem já recebe `options` recortadas pelo servidor não pode filtrar de novo
	// aqui: a busca do servidor ignora acento e a daqui não, então digitar "sao"
	// escondia o "São Paulo" que o próprio servidor tinha acabado de devolver.
	remoteSearch = false,
	isLoading = false,
	className = '',
}) => {
	const errorMessage = !error
		? null
		: typeof error === 'string'
			? error
			: String(error)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')

	const normalizedValue = useMemo(() => {
		if (multiSelect) {
			return Array.isArray(value) ? value : value ? [value] : []
		}
		return value
	}, [value, multiSelect])

	const compareValues = useCallback((a, b) => {
		if (a === b) return true
		return String(a) === String(b)
	}, [])

	const selectedOptions = useMemo(() => {
		if (!normalizedValue || !Array.isArray(normalizedValue)) return []
		return options.filter((opt) =>
			normalizedValue.some((v) => compareValues(v, opt.value)),
		)
	}, [options, normalizedValue, compareValues])

	const displayText = useMemo(() => {
		if (multiSelect) {
			if (selectedOptions.length === 0) return placeholder
			return `${selectedOptions.length} selecionados`
		}
		const selectedOption = options.find((opt) =>
			compareValues(opt.value, value),
		)
		return selectedOption?.label || placeholder
	}, [multiSelect, selectedOptions, value, options, placeholder, compareValues])

	const isSelected = (optionValue) => {
		if (multiSelect) {
			if (!normalizedValue || !Array.isArray(normalizedValue)) return false
			return normalizedValue.some((v) => compareValues(v, optionValue))
		}
		return compareValues(value, optionValue)
	}

	const handleSelect = (optionValue) => {
		if (multiSelect) {
			const arr = normalizedValue
			const newValue = isSelected(optionValue)
				? arr.filter((v) => !compareValues(v, optionValue))
				: [...arr, optionValue]
			onChange(newValue)
		} else {
			onChange(optionValue)
			setDialogOpen(false)
			setSearchQuery('')
		}
	}

	const handleRemoveTag = (optionValue) => {
		if (multiSelect && Array.isArray(normalizedValue)) {
			const newValue = normalizedValue.filter(
				(v) => !compareValues(v, optionValue),
			)
			onChange(newValue)
		}
	}

	const DISPLAY_LIMIT = 100

	const filteredOptions = useMemo(() => {
		if (remoteSearch || !searchable || !searchQuery.trim())
			return options.slice(0, DISPLAY_LIMIT)
		const q = searchQuery.toLowerCase()
		return options
			.filter((opt) => opt.label.toLowerCase().includes(q))
			.slice(0, DISPLAY_LIMIT)
	}, [options, searchQuery, searchable, remoteSearch])

	useEffect(() => {
		if (onSearchChange && searchable && dialogOpen) {
			onSearchChange(searchQuery)
		}
	}, [searchQuery, searchable, dialogOpen, onSearchChange])

	if (!editable) {
		return (
			<div className='space-y-1.5'>
				<div
					className={cn(
						'flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3',
						className,
					)}
				>
					<span className='flex-1 text-sm text-foreground'>{displayText}</span>
					<Lock className='ml-2 h-4 w-4 text-muted-foreground' />
				</div>
				{error && <p className='text-sm text-destructive'>{errorMessage}</p>}
			</div>
		)
	}

	return (
		<div className='space-y-1.5'>
			<Button
				type='button'
				variant='outline'
				onClick={() => setDialogOpen(true)}
				className={cn(
					'w-full justify-between font-normal',
					((multiSelect && normalizedValue.length === 0) ||
						(!multiSelect && !value)) &&
						'text-muted-foreground',
					error && 'border-destructive bg-destructive/5',
					className,
				)}
			>
				<span className='truncate'>{displayText}</span>
				<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
			</Button>

			{/* Tags for multiSelect */}
			{multiSelect && selectedOptions.length > 0 && (
				<div className='flex flex-wrap gap-1.5 pt-1'>
					{selectedOptions.map((opt) => (
						<Badge
							key={String(opt.value)}
							variant='secondary'
							className='gap-1 pr-1'
						>
							{opt.label}
							<button
								type='button'
								onClick={() => handleRemoveTag(opt.value)}
								className='ml-1 rounded-full p-0.5 hover:bg-muted'
							>
								<X className='h-3 w-3' />
							</button>
						</Badge>
					))}
				</div>
			)}

			{error && <p className='text-sm text-destructive'>{errorMessage}</p>}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className='max-h-[80vh] overflow-hidden p-0 sm:max-w-[425px]'>
					<DialogHeader className='px-4 pt-4 pb-0'>
						<DialogTitle>{label || 'Selecione'}</DialogTitle>
						<DialogDescription className='sr-only'>
							{multiSelect
								? 'Selecione uma ou mais opções da lista'
								: 'Selecione uma opção da lista'}
						</DialogDescription>
						{multiSelect && normalizedValue.length > 0 && (
							<p className='text-sm text-primary'>
								{normalizedValue.length}{' '}
								{normalizedValue.length === 1
									? 'item selecionado'
									: 'itens selecionados'}
							</p>
						)}
					</DialogHeader>
					<Command shouldFilter={false}>
						{searchable && (
							<CommandInput
								placeholder={searchPlaceholder}
								value={searchQuery}
								onValueChange={setSearchQuery}
							/>
						)}
						<CommandList className='max-h-[50vh]'>
							<CommandEmpty>
								{isLoading ? 'Buscando...' : emptyMessage}
							</CommandEmpty>
							<CommandGroup>
								{filteredOptions.map((option) => {
									const selected = isSelected(option.value)
									return (
										<CommandItem
											key={String(option.value)}
											value={option.label}
											onSelect={() => handleSelect(option.value)}
											className='cursor-pointer'
										>
											<Check
												className={cn(
													'mr-2 h-4 w-4',
													selected ? 'opacity-100 text-primary' : 'opacity-0',
												)}
											/>
											<span
												className={selected ? 'font-semibold text-primary' : ''}
											>
												{option.label}
											</span>
										</CommandItem>
									)
								})}
							</CommandGroup>
							{filteredOptions.length >= DISPLAY_LIMIT && (
								<p className='px-3 py-2 text-center text-xs text-muted-foreground'>
									Mostrando {filteredOptions.length} resultados — refine a busca
									para ver mais
								</p>
							)}
						</CommandList>
					</Command>
					{multiSelect && (
						<div className='border-t p-4'>
							<Button
								onClick={() => {
									setDialogOpen(false)
									setSearchQuery('')
								}}
								className='w-full'
							>
								Confirmar
							</Button>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default SearchPickerField
