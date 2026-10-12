import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from 'src/lib/utils'
import { Button } from './button'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from './command'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export function SearchSelect({
	options = [],
	value = [],
	onChange = () => {},
	placeholder = 'Selecione uma opção...',
	searchPlaceholder = 'Buscar...',
	multiple = false,
	disabled = false,
	className = '',
	isLoading = false,
	onSearch = null, // Callback para busca assíncrona
	// Combo de "adicionar à lista": a escolha não é o valor do campo, é um item
	// que vai para uma lista ao lado. Fechar e limpar a busca a cada clique
	// obrigava a reabrir e redigitar o termo para o próximo item.
	closeOnSelect = true,
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')

	// A busca local é do cmdk (`shouldFilter`), que casa o termo com o `value` e
	// os `keywords` de cada item — não com o texto renderizado.
	useEffect(() => {
		onSearch?.(search)
	}, [search, onSearch])

	// A busca assíncrona troca a lista de opções, e a escolhida pode não estar na
	// resposta da busca seguinte: sem lembrar o rótulo, o gatilho volta a exibir o
	// placeholder mesmo com valor selecionado.
	const [rotuloLembrado, setRotuloLembrado] = useState(null)
	const rotuloAtual = options.find((opt) => opt.value === value)?.label

	useEffect(() => {
		if (multiple) return
		if (!value) setRotuloLembrado(null)
		else if (rotuloAtual) setRotuloLembrado(rotuloAtual)
	}, [multiple, value, rotuloAtual])

	const isSelected = (optionValue) => {
		if (multiple) {
			return Array.isArray(value) && value.includes(optionValue)
		}
		return value === optionValue
	}

	const handleSelect = (optionValue) => {
		if (multiple) {
			const newValue =
				Array.isArray(value) && value.includes(optionValue)
					? value.filter((v) => v !== optionValue)
					: [...(Array.isArray(value) ? value : []), optionValue]
			onChange(newValue)
		} else {
			onChange(optionValue)
			if (closeOnSelect) {
				setOpen(false)
				setSearch('')
			}
		}
	}

	const handleRemove = (optionValue, e) => {
		e?.stopPropagation()
		if (multiple) {
			const newValue = value.filter((v) => v !== optionValue)
			onChange(newValue)
		}
	}

	const getSelectedLabels = () => {
		if (multiple && Array.isArray(value)) {
			return value
				.map((v) => options.find((opt) => opt.value === v)?.label)
				.filter(Boolean)
		}
		return rotuloAtual ?? rotuloLembrado
	}

	const selectedLabel = getSelectedLabels()

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant='outline'
					role='combobox'
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						'w-full justify-between min-h-10',
						!selectedLabel && 'text-muted-foreground',
						className,
					)}
				>
					<div className='flex flex-1 flex-wrap gap-1 min-w-0'>
						{multiple && Array.isArray(value) && value.length > 0 ? (
							value.length > 3 ? (
								<>
									{value.slice(0, 2).map((v) => {
										const label = options.find((opt) => opt.value === v)?.label
										return (
											<div
												key={v}
												className='inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs flex-shrink-0'
											>
												{label}
												<X
													className='h-3 w-3 cursor-pointer hover:text-destructive'
													onClick={(e) => handleRemove(v, e)}
												/>
											</div>
										)
									})}
									<div className='inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs flex-shrink-0'>
										+{value.length - 2}
									</div>
								</>
							) : (
								value.map((v) => {
									const label = options.find((opt) => opt.value === v)?.label
									return (
										<div
											key={v}
											className='inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs flex-shrink-0'
										>
											{label}
											<X
												className='h-3 w-3 cursor-pointer hover:text-destructive'
												onClick={(e) => handleRemove(v, e)}
											/>
										</div>
									)
								})
							)
						) : selectedLabel ? (
							<span className='truncate'>{selectedLabel}</span>
						) : (
							<span className='truncate'>{placeholder}</span>
						)}
					</div>
					<ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
				</Button>
			</PopoverTrigger>
			<PopoverContent className='w-full p-0'>
				<Command shouldFilter={!onSearch}>
					{/* Sem `disabled={isLoading}`: em busca assíncrona cada tecla
					    dispara um fetch, e desabilitar o campo enquanto ele corre
					    engolia as teclas seguintes. O estado de carga aparece no
					    CommandEmpty. */}
					<CommandInput
						placeholder={searchPlaceholder}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList>
						<CommandEmpty>
							{isLoading ? 'Carregando...' : 'Nenhuma opção encontrada.'}
						</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									value={option.value}
									keywords={[option.label]}
									onSelect={() => handleSelect(option.value)}
									disabled={option.disabled}
								>
									<Check
										className={cn(
											'mr-2 h-4 w-4',
											isSelected(option.value) ? 'opacity-100' : 'opacity-0',
										)}
									/>
									{option.label}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
