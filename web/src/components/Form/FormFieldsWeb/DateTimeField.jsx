import { format, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarIcon, Clock, Lock, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { Button } from 'src/components/ui/button'
import { Calendar } from 'src/components/ui/calendar'
import { Input } from 'src/components/ui/input'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'src/components/ui/popover'
import { cn } from 'src/lib/utils'

const formatDate = (date) => {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

const formatDateTime = (date) => {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	const hh = String(date.getHours()).padStart(2, '0')
	const mm = String(date.getMinutes()).padStart(2, '0')
	return `${y}-${m}-${d} ${hh}:${mm}`
}

const toDisplayText = (isoValue) => {
	if (!isoValue) return ''
	const datePart = isoValue.includes(' ') ? isoValue.split(' ')[0] : isoValue
	const [y, mo, d] = datePart.split('-')
	if (y && mo && d) return `${d}/${mo}/${y}`
	return ''
}

const applyDateMask = (raw) => {
	const digits = raw.replace(/\D/g, '').slice(0, 8)
	if (digits.length <= 2) return digits
	if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
	return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

const NOW = new Date()
const BIRTH_START = new Date(1900, 0, 1)

// Mês em que o calendário abre quando ainda não há data escolhida.
//
// Campo de data de nascimento (`noFutureDate`) abre em 1990 — navegar de hoje
// até 1985 são 40 cliques. Campo de data futura, tipo a expiração de um código
// de acesso, abre em 1990 e vira o mesmo problema ao contrário: era 1990 para
// todo mundo, e quem ia marcar dezembro do ano que vem encontrava a década
// errada.
const mesInicial = (selecionado, noFutureDate) =>
	selecionado ?? (noFutureDate ? new Date(1990, 0) : new Date())

const DateTimeField = ({
	value,
	onChange,
	error,
	editable = true,
	mode = 'datetime',
	showCurrentButton = true,
	noFutureDate = false,
	className = '',
}) => {
	const errorMessage = !error
		? null
		: typeof error === 'string'
			? error
			: String(error)
	const isDateOnly = mode === 'date'

	const [open, setOpen] = useState(false)
	const [textInput, setTextInput] = useState(() => toDisplayText(value))
	const [timeValue, setTimeValue] = useState(() => {
		if (value && !isDateOnly && value.includes(' ')) {
			return value.split(' ')[1] || '00:00'
		}
		return '00:00'
	})

	const prevValue = useRef(value)
	useEffect(() => {
		if (value !== prevValue.current) {
			prevValue.current = value
			setTextInput(toDisplayText(value))
		}
	}, [value])

	const selectedDate = React.useMemo(() => {
		if (!value) return undefined
		try {
			const datePart = value.includes(' ') ? value.split(' ')[0] : value
			const parsed = parse(datePart, 'yyyy-MM-dd', new Date())
			return Number.isNaN(parsed.getTime()) ? undefined : parsed
		} catch {
			return undefined
		}
	}, [value])

	const isFutureDate = (date) => {
		const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate())
		const sel = new Date(date.getFullYear(), date.getMonth(), date.getDate())
		return sel > today
	}

	const handleTextChange = (e) => {
		const masked = applyDateMask(e.target.value)
		setTextInput(masked)
		const digits = masked.replace(/\D/g, '')
		if (digits.length === 8) {
			const day = +digits.slice(0, 2)
			const month = +digits.slice(2, 4)
			const year = +digits.slice(4, 8)
			const date = new Date(year, month - 1, day)
			const valid =
				!Number.isNaN(date.getTime()) &&
				date.getDate() === day &&
				date.getMonth() === month - 1 &&
				date.getFullYear() === year
			if (valid && !(noFutureDate && isFutureDate(date))) {
				onChange(formatDate(date))
			}
		} else if (digits.length === 0) {
			onChange('')
		}
	}

	const handleDateSelect = (date) => {
		if (!date) return
		if (noFutureDate && isFutureDate(date)) return
		if (isDateOnly) {
			onChange(formatDate(date))
			setOpen(false)
		} else {
			const [hours, minutes] = timeValue.split(':').map(Number)
			date.setHours(hours || 0, minutes || 0)
			onChange(formatDateTime(date))
			setOpen(false)
		}
	}

	const handleTimeChange = (e) => {
		const newTime = e.target.value
		setTimeValue(newTime)
		if (selectedDate) {
			const [hours, minutes] = newTime.split(':').map(Number)
			const newDate = new Date(selectedDate)
			newDate.setHours(hours || 0, minutes || 0)
			if (noFutureDate && isFutureDate(newDate)) return
			onChange(formatDateTime(newDate))
		}
	}

	const setCurrentDateTime = () => {
		const now = new Date()
		setTimeValue(
			`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
		)
		onChange(isDateOnly ? formatDate(now) : formatDateTime(now))
	}

	const displayValue = React.useMemo(() => {
		if (!value)
			return isDateOnly ? 'Selecione uma data' : 'Selecione data e hora'
		try {
			if (isDateOnly) {
				const datePart = value.includes(' ') ? value.split(' ')[0] : value
				const parsed = parse(datePart, 'yyyy-MM-dd', new Date())
				return Number.isNaN(parsed.getTime())
					? value
					: format(parsed, 'dd/MM/yyyy', { locale: ptBR })
			}
			const datePart = value.includes(' ') ? value.split(' ')[0] : value
			const timePart = value.includes(' ') ? value.split(' ')[1] : ''
			const parsed = parse(datePart, 'yyyy-MM-dd', new Date())
			return Number.isNaN(parsed.getTime())
				? value
				: `${format(parsed, 'dd/MM/yyyy', { locale: ptBR })} ${timePart}`
		} catch {
			return value
		}
	}, [value, isDateOnly])

	if (!editable) {
		return (
			<div className={cn('space-y-1.5', className)}>
				<div className='flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3'>
					<span className='flex-1 text-sm text-foreground'>
						{displayValue || '—'}
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
		<div className={cn('space-y-2', className)}>
			{isDateOnly ? (
				<div
					className={`flex gap-1 ${error ? 'rounded-md ring-1 ring-destructive' : ''}`}
				>
					<Input
						type='text'
						inputMode='numeric'
						value={textInput}
						onChange={handleTextChange}
						placeholder='DD/MM/AAAA'
						maxLength={10}
						className={`flex-1 ${error ? 'border-destructive bg-destructive/5' : ''}`}
					/>
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<Button
								type='button'
								variant='outline'
								size='icon'
								className={error ? 'border-destructive bg-destructive/5' : ''}
							>
								<CalendarIcon className='h-4 w-4 opacity-50' />
							</Button>
						</PopoverTrigger>
						<PopoverContent className='w-auto p-0' align='end'>
							<Calendar
								mode='single'
								selected={selectedDate}
								onSelect={handleDateSelect}
								locale={ptBR}
								captionLayout='dropdown'
								startMonth={BIRTH_START}
								endMonth={noFutureDate ? NOW : undefined}
								defaultMonth={mesInicial(selectedDate, noFutureDate)}
								disabled={
									noFutureDate ? (date) => isFutureDate(date) : undefined
								}
							/>
						</PopoverContent>
					</Popover>
				</div>
			) : (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							type='button'
							variant='outline'
							className={`w-full justify-between font-normal ${!value ? 'text-muted-foreground' : ''} ${error ? 'border-destructive bg-destructive/5' : ''}`}
						>
							<span className='truncate'>{displayValue}</span>
							<CalendarIcon className='ml-2 h-4 w-4 shrink-0 opacity-50' />
						</Button>
					</PopoverTrigger>
					<PopoverContent className='w-auto p-0' align='start'>
						<Calendar
							mode='single'
							selected={selectedDate}
							onSelect={handleDateSelect}
							locale={ptBR}
							captionLayout='dropdown'
							startMonth={BIRTH_START}
							endMonth={noFutureDate ? NOW : undefined}
							defaultMonth={mesInicial(selectedDate, noFutureDate)}
							disabled={noFutureDate ? (date) => isFutureDate(date) : undefined}
						/>
						<div className='border-t px-4 py-3'>
							<div className='flex items-center gap-2'>
								<Clock className='h-4 w-4 text-muted-foreground' />
								<Input
									type='time'
									value={timeValue}
									onChange={handleTimeChange}
									className='w-auto'
								/>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			)}

			<div className='flex gap-2'>
				{showCurrentButton && (
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={setCurrentDateTime}
						className='text-primary border-primary/30 hover:bg-primary/5'
					>
						{isDateOnly ? (
							<>
								<CalendarIcon className='mr-1 h-3.5 w-3.5' />
								Usar Data Atual
							</>
						) : (
							<>
								<Clock className='mr-1 h-3.5 w-3.5' />
								Usar Data/Hora Atual
							</>
						)}
					</Button>
				)}

				{value && (
					<Button
						type='button'
						variant='ghost'
						size='sm'
						onClick={() => {
							onChange('')
							setTextInput('')
						}}
						className='text-muted-foreground'
					>
						<X className='mr-1 h-3.5 w-3.5' />
						Limpar
					</Button>
				)}
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

export default DateTimeField
