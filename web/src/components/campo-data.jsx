import { ptBR } from 'date-fns/locale'
import { CalendarIcon, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from 'src/components/ui/button'
import { Calendar } from 'src/components/ui/calendar'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'src/components/ui/popover'
import { cn } from 'src/lib/utils'

/** "2026-10-07" → Date local (meia-noite), sem o deslocamento de fuso do `new Date(ymd)`. */
const doYmd = (valor) => {
	if (!valor) return undefined
	const [a, m, d] = valor.slice(0, 10).split('-').map(Number)
	return new Date(a, m - 1, d)
}

const paraYmd = (data) =>
	`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`

const br = (valor) =>
	valor ? valor.slice(0, 10).split('-').reverse().join('/') : ''

/**
 * Campo de data com o calendário do projeto, no lugar do `<input type="date">`
 * do navegador: o nativo deixa digitar uma data fora de `min`/`max` e só a
 * validação depois avisa. Aqui o dia proibido nem pode ser escolhido, e a
 * dica embaixo do calendário diz o porquê.
 *
 * Valor e limites em `yyyy-MM-dd`, como o resto das telas.
 *
 * @param {object} props
 * @param {string} props.valor
 * @param {(ymd: string) => void} props.onChange  '' ao limpar
 * @param {string} [props.min]
 * @param {string} [props.max]
 * @param {string} [props.dica]  linha embaixo do calendário (ex.: "Até hoje")
 */
export function CampoData({
	valor,
	onChange,
	min,
	max,
	dica,
	placeholder = 'Escolha a data',
	disabled,
	title,
	className,
	id,
}) {
	const [aberto, setAberto] = useState(false)
	const data = doYmd(valor)
	const minimo = doYmd(min)
	const maximo = doYmd(max)
	const hoje = paraYmd(new Date())
	const hojePermitido = (!min || hoje >= min) && (!max || hoje <= max)

	return (
		<Popover open={aberto} onOpenChange={setAberto}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					variant='outline'
					disabled={disabled}
					title={title}
					className={cn(
						'w-full justify-start font-normal tabular-nums',
						!data && 'text-muted-foreground',
						className,
					)}
				>
					<CalendarIcon className='mr-2 h-4 w-4 shrink-0 text-brand-text' />
					{data ? br(valor) : placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent className='w-auto p-0' align='start'>
				<Calendar
					mode='single'
					locale={ptBR}
					selected={data}
					defaultMonth={data ?? maximo ?? minimo}
					startMonth={minimo}
					endMonth={maximo}
					disabled={[
						...(minimo ? [{ before: minimo }] : []),
						...(maximo ? [{ after: maximo }] : []),
					]}
					onSelect={(d) => {
						if (!d) return
						onChange(paraYmd(d))
						setAberto(false)
					}}
				/>
				<div className='flex items-center justify-between gap-2 border-t p-2'>
					<span className='px-1 text-caption text-muted-foreground'>
						{dica}
					</span>
					<div className='flex gap-1'>
						{valor && (
							<Button
								variant='ghost'
								size='sm'
								onClick={() => {
									onChange('')
									setAberto(false)
								}}
							>
								<X className='h-3.5 w-3.5' />
								Limpar
							</Button>
						)}
						<Button
							variant='brand'
							size='sm'
							disabled={!hojePermitido}
							onClick={() => {
								onChange(hoje)
								setAberto(false)
							}}
						>
							Hoje
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}
