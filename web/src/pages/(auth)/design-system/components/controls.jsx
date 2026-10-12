import {
	CircleCheck,
	ClipboardList,
	Loader2,
	Play,
	Plus,
	Trash2,
	TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { Avatar, AvatarFallback } from 'src/components/ui/avatar'
import { Badge } from 'src/components/ui/badge'
import { Button } from 'src/components/ui/button'
import { Checkbox } from 'src/components/ui/checkbox'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from 'src/components/ui/collapsible'
import { Input } from 'src/components/ui/input'
import { Label as UiLabel } from 'src/components/ui/label'
import { RadioGroup, RadioGroupItem } from 'src/components/ui/radio-group'
import { SearchSelect } from 'src/components/ui/search-select'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'src/components/ui/select'
import { Separator } from 'src/components/ui/separator'
import { Skeleton } from 'src/components/ui/skeleton'
import { Switch } from 'src/components/ui/switch'
import { Textarea } from 'src/components/ui/textarea'
import { Block, Label, Row, Section } from './showcase'

const BUTTON_VARIANTS = [
	'default',
	'secondary',
	'brand',
	'outline',
	'success',
	'destructive',
	'ghost',
	'link',
]

const OPTIONS = [
	{ label: 'Plan — Planejar', value: 'plan' },
	{ label: 'Do — Executar', value: 'do' },
	{ label: 'Check — Verificar', value: 'check' },
	{ label: 'Act — Ajustar', value: 'act' },
]

export function ControlsSection() {
	const [switchOn, setSwitchOn] = useState(true)
	const [checked, setChecked] = useState(true)
	const [radio, setRadio] = useState('do')
	const [multi, setMulti] = useState(['plan'])
	const [open, setOpen] = useState(false)

	return (
		<Section
			id='controles'
			title='Controles'
			description='Altura base 40px (h-control). Foco sempre em ring-ring (brand-strong) com offset.'
		>
			<Block title='Button — variantes' hint='variant × size × estado'>
				<div className='space-y-4'>
					<div className='space-y-2'>
						<Label>variant</Label>
						<Row>
							{BUTTON_VARIANTS.map((v) => (
								<Button key={v} variant={v}>
									{v}
								</Button>
							))}
						</Row>
					</div>

					<Separator />

					<div className='space-y-2'>
						<Label>size</Label>
						<Row>
							<Button size='sm'>sm · 36px</Button>
							<Button size='default'>default · 40px</Button>
							<Button size='lg'>lg · 44px</Button>
							<Button size='icon' aria-label='Adicionar'>
								<Plus />
							</Button>
							<Button size='icon-sm' variant='outline' aria-label='Excluir'>
								<Trash2 />
							</Button>
							<Button size='icon-lg' variant='brand' aria-label='Executar'>
								<Play />
							</Button>
						</Row>
					</div>

					<Separator />

					<div className='space-y-2'>
						<Label>estado</Label>
						<Row>
							<Button>
								<Plus />
								Com ícone
							</Button>
							<Button disabled>Desabilitado</Button>
							<Button disabled>
								<Loader2 className='animate-spin' />
								Salvando...
							</Button>
							<Button variant='secondary' className='w-full sm:w-auto'>
								Responsivo
							</Button>
						</Row>
					</div>
				</div>
			</Block>

			<Block
				title='Badge — variantes'
				hint='Estado sempre cor + texto (ou ícone). Nunca cor isolada.'
			>
				<div className='space-y-4'>
					<div className='space-y-2'>
						<Label>variant</Label>
						<Row>
							<Badge>default</Badge>
							<Badge variant='secondary'>secondary</Badge>
							<Badge variant='outline'>outline</Badge>
							<Badge variant='brand'>brand</Badge>
							<Badge variant='success'>success</Badge>
							<Badge variant='destructive'>destructive</Badge>
						</Row>
					</div>

				</div>
			</Block>

			<div className='grid gap-4 lg:grid-cols-2'>
				<Block
					title='Input · Textarea'
					hint='Foco azul, erro por aria-invalid.'
				>
					<div className='space-y-2'>
						<UiLabel htmlFor='ds-input'>Nome do plano</UiLabel>
						<Input id='ds-input' placeholder='Digite o nome do plano...' />
					</div>
					<div className='space-y-2'>
						<UiLabel htmlFor='ds-input-err'>Responsável</UiLabel>
						<Input
							id='ds-input-err'
							aria-invalid='true'
							defaultValue='email-invalido'
						/>
						<p className='text-caption text-destructive'>
							Informe um e-mail válido.
						</p>
					</div>
					<div className='space-y-2'>
						<UiLabel htmlFor='ds-input-dis'>Código (somente leitura)</UiLabel>
						<Input id='ds-input-dis' disabled defaultValue='ITEM-0142' />
					</div>
					<div className='space-y-2'>
						<UiLabel htmlFor='ds-textarea'>Observações</UiLabel>
						<Textarea id='ds-textarea' placeholder='Registre a análise...' />
					</div>
				</Block>

				<Block
					title='Seleção'
					hint='Select, SearchSelect, Radio, Checkbox, Switch.'
				>
					<div className='space-y-2'>
						<UiLabel>Fase atual</UiLabel>
						<Select defaultValue='do'>
							<SelectTrigger>
								<SelectValue placeholder='Selecione a fase' />
							</SelectTrigger>
							<SelectContent>
								{OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className='space-y-2'>
						<UiLabel>Fases envolvidas (múltipla)</UiLabel>
						<SearchSelect
							options={OPTIONS}
							value={multi}
							onChange={setMulti}
							multiple
							placeholder='Selecione as fases...'
						/>
					</div>

					<div className='space-y-2'>
						<UiLabel>Prioridade</UiLabel>
						<RadioGroup value={radio} onValueChange={setRadio}>
							{OPTIONS.map((o) => (
								<div key={o.value} className='flex items-center gap-2'>
									<RadioGroupItem value={o.value} id={`ds-radio-${o.value}`} />
									<UiLabel
										htmlFor={`ds-radio-${o.value}`}
										className='font-normal'
									>
										{o.label}
									</UiLabel>
								</div>
							))}
						</RadioGroup>
					</div>

					<Separator />

					<div className='flex items-center gap-2'>
						<Checkbox
							id='ds-check'
							checked={checked}
							onCheckedChange={setChecked}
						/>
						<UiLabel htmlFor='ds-check' className='font-normal'>
							Notificar responsáveis
						</UiLabel>
					</div>

					<div className='flex items-center justify-between rounded-lg border border-border p-4'>
						<div className='space-y-0.5'>
							<UiLabel>Ciclo ativo</UiLabel>
							<p className='text-caption text-muted-foreground'>
								Inativos não aparecem nas seleções do sistema.
							</p>
						</div>
						<Switch checked={switchOn} onCheckedChange={setSwitchOn} />
					</div>
				</Block>
			</div>

			<div className='grid gap-4 lg:grid-cols-3'>
				<Block title='Avatar'>
					<Row>
						<Avatar>
							<AvatarFallback>JP</AvatarFallback>
						</Avatar>
						<Avatar className='size-12'>
							<AvatarFallback className='bg-brand-light text-brand-text'>
								MC
							</AvatarFallback>
						</Avatar>
						<Avatar className='size-8'>
							<AvatarFallback className='text-caption'>AL</AvatarFallback>
						</Avatar>
					</Row>
				</Block>

				<Block title='Skeleton' hint='Fallback de loading.'>
					<div className='space-y-2'>
						<Skeleton className='h-4 w-3/4' />
						<Skeleton className='h-4 w-1/2' />
						<Skeleton className='h-16 w-full rounded-xl' />
					</div>
				</Block>

				<Block title='Collapsible'>
					<Collapsible open={open} onOpenChange={setOpen}>
						<CollapsibleTrigger asChild>
							<Button variant='outline' className='w-full'>
								{open ? 'Ocultar' : 'Exibir'} detalhes do ciclo
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent className='pt-3'>
							<p className='text-body text-muted-foreground'>
								Ciclo iniciado em 03/2026, com 4 planos de ação e 12
								verificações registradas.
							</p>
						</CollapsibleContent>
					</Collapsible>
				</Block>
			</div>
		</Section>
	)
}
