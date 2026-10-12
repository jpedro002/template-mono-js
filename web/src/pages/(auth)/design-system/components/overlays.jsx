import { CalendarDays, Ellipsis, Info, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from 'src/components/ui/alert-dialog'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from 'src/components/ui/breadcrumb'
import { Button } from 'src/components/ui/button'
import { Calendar } from 'src/components/ui/calendar'
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
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from 'src/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu'
import { Input } from 'src/components/ui/input'
import { Label as UiLabel } from 'src/components/ui/label'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'src/components/ui/popover'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from 'src/components/ui/sheet'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'src/components/ui/tooltip'
import { toast } from 'src/lib/toast'
import { Block, Row, Section } from './showcase'

export function OverlaysSection() {
	const [date, setDate] = useState(new Date(2026, 7, 21))

	return (
		<Section
			id='overlays'
			title='Overlays & Navegação'
			description='Superfícies elevadas usam shadow-lg + border. Toast pelo sonner.'
		>
			<Block title='Diálogos e painéis'>
				<Row>
					<Dialog>
						<DialogTrigger asChild>
							<Button variant='outline'>Dialog</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Novo item</DialogTitle>
								<DialogDescription>
									Defina o período e o responsável pelo ciclo.
								</DialogDescription>
							</DialogHeader>
							<div className='space-y-2'>
								<UiLabel htmlFor='ds-dialog-input'>Nome do ciclo</UiLabel>
								<Input id='ds-dialog-input' placeholder='Ciclo 2026.1' />
							</div>
							<DialogFooter>
								<Button variant='secondary'>Cancelar</Button>
								<Button>Criar ciclo</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant='destructive'>
								<Trash2 />
								AlertDialog
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Excluir plano de ação</AlertDialogTitle>
								<AlertDialogDescription>
									Esta ação não pode ser desfeita. O plano e suas verificações
									serão removidos.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancelar</AlertDialogCancel>
								<AlertDialogAction>Sim, excluir</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>

					<Sheet>
						<SheetTrigger asChild>
							<Button variant='outline'>Sheet</Button>
						</SheetTrigger>
						<SheetContent>
							<SheetHeader>
								<SheetTitle>Filtros de auditoria</SheetTitle>
								<SheetDescription>
									Refine os registros exibidos na tabela.
								</SheetDescription>
							</SheetHeader>
							<div className='space-y-2 p-4'>
								<UiLabel htmlFor='ds-sheet-input'>Termo</UiLabel>
								<Input id='ds-sheet-input' placeholder='Buscar...' />
							</div>
						</SheetContent>
					</Sheet>

					<Popover>
						<PopoverTrigger asChild>
							<Button variant='secondary'>Popover</Button>
						</PopoverTrigger>
						<PopoverContent className='w-72'>
							<p className='text-body font-semibold'>Meta do indicador</p>
							<p className='text-caption text-muted-foreground'>
								Percentual mínimo aceito na fase Check antes da liberação para
								Act.
							</p>
						</PopoverContent>
					</Popover>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant='ghost' size='icon' aria-label='Ajuda'>
									<Info />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Tooltip de apoio</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='outline' size='icon' aria-label='Ações'>
								<Ellipsis />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuLabel>Ações</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem>Editar</DropdownMenuItem>
							<DropdownMenuItem>Duplicar</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant='destructive'>Excluir</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</Row>
			</Block>

			<Block title='Toast' hint='src/lib/toast delega ao sonner.'>
				<Row>
					<Button
						variant='success'
						onClick={() => toast.success('Ciclo criado com sucesso!')}
					>
						success
					</Button>
					<Button
						variant='destructive'
						onClick={() => toast.error('Falha ao salvar o plano.')}
					>
						error
					</Button>
					<Button
						variant='brand'
						onClick={() => toast.warning('Verificação pendente há 7 dias.')}
					>
						warning
					</Button>
					<Button
						variant='outline'
						onClick={() => toast.info('3 planos aguardando aprovação.')}
					>
						info
					</Button>
				</Row>
			</Block>

			<div className='grid gap-4 lg:grid-cols-2'>
				<Block title='Command' hint='Paleta de busca (cmdk).'>
					<Command className='rounded-lg border border-border'>
						<CommandInput placeholder='Buscar módulo...' />
						<CommandList>
							<CommandEmpty>Nenhum resultado.</CommandEmpty>
							<CommandGroup heading='Organização'>
								<CommandItem>
									<Search />
									Clientes
								</CommandItem>
								<CommandItem>
									<Search />
									Instituições
								</CommandItem>
								<CommandItem>
									<Search />
									Itens
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</Block>

				<Block
					title='Calendar'
					hint='react-day-picker, locale pt-BR nos campos de data.'
				>
					<div className='space-y-3'>
						<Calendar mode='single' selected={date} onSelect={setDate} />
						<p className='text-caption text-muted-foreground'>
							<CalendarDays className='mr-1 inline size-3' />
							{date ? date.toLocaleDateString('pt-BR') : 'Nenhuma data'}
						</p>
					</div>
				</Block>
			</div>

			<Block title='Breadcrumb'>
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href='/'>Início</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink href='/organizacao/clientes'>
								Organização
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>Design System</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</Block>
		</Section>
	)
}
