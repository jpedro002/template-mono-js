import {
	Activity,
	BarChart3,
	BarChart4,
	BookCopy,
	Briefcase,
	Building,
	Building2,
	CalendarRange,
	ChevronRight,
	ClipboardPenLine,
	Clock,
	Database,
	FileSearch,
	FileText,
	GitBranch,
	KeyRound,
	Landmark,
	Layers,
	Layers3,
	Lightbulb,
	LineChart,
	ListChecks,
	ListOrdered,
	Lock,
	Map as MapIcon,
	Megaphone,
	NotebookPen,
	Palette,
	Play,
	RefreshCw,
	School,
	Settings2,
	Shield,
	Siren,
	Target,
	UploadCloud,
	UserCog,
	UserRound,
	Users,
	Users2,
	Waypoints,
} from 'lucide-react'
import { Link, useLocation } from 'react-router'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from 'src/components/ui/collapsible'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu'
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from 'src/components/ui/sidebar'
import { useAuthPermissions, useAuthRoles } from 'src/contexts/auth-context'
import { preloadRoute } from 'src/generated/rota-preload'
import { podeAbrirRota } from 'src/lib/permissao-da-rota'

// Mapa de ícones usando lucide-react
const iconMap = {
	Users: Users,
	Shield: Shield,
	Lock: Lock,
	FileText: FileText,
	Building2: Building2,
	Map: MapIcon,
	Building: Building,
	Waypoints: Waypoints,
	School: School,
	Users2: Users2,
	Layers: Layers,
	ListOrdered: ListOrdered,
	Clock: Clock,
	KeyRound: KeyRound,
	Layers3: Layers3,
	Briefcase: Briefcase,
	Palette: Palette,
	Database: Database,
	BarChart3: BarChart3,
	BarChart4: BarChart4,
	Target: Target,
	Play: Play,
	LineChart: LineChart,
	RefreshCw: RefreshCw,
	Activity: Activity,
	BookCopy: BookCopy,
	Lightbulb: Lightbulb,
	NotebookPen: NotebookPen,
	UploadCloud: UploadCloud,
	ClipboardPenLine: ClipboardPenLine,
	ListChecks: ListChecks,
	UserRound: UserRound,
	Megaphone: Megaphone,
	Siren: Siren,
	FileSearch: FileSearch,
	Landmark: Landmark,
	GitBranch: GitBranch,
	Settings2: Settings2,
	CalendarRange: CalendarRange,
	UserCog: UserCog,
}

// Esconde só do menu: a rota continua aberta para quem tem a permissão. Quem
// acumula outro perfil fora da lista continua vendo.
function ocultoParaPerfis(ocultarPara, roles) {
	if (!ocultarPara?.length || roles.length === 0) return false
	return roles.every((role) => ocultarPara.includes(role))
}

export function NavMain({ items }) {
	const { state } = useSidebar()
	const isCollapsed = state === 'collapsed'
	const { pathname } = useLocation()
	// Uma leitura só, no topo. `useHasPermission` era chamado dentro dos
	// callbacks de `filter` abaixo — hook em posição condicional, que quebra
	// assim que ele passar a usar estado de verdade.
	const permissions = useAuthPermissions()
	const roles = useAuthRoles()

	const isUrlActive = (url) =>
		!!url && (pathname === url || pathname.startsWith(`${url}/`))

	// Filtrar subitens baseado em permissão. Quem responde é a rota de destino,
	// via `rotaPermissoes` — o `permission` do item só vale para link sem gate.
	const getFilteredSubItems = (subItems) => {
		if (!subItems) return []
		return subItems.filter(
			(subItem) =>
				podeAbrirRota(subItem.url, permissions, subItem.permission) &&
				!ocultoParaPerfis(subItem.ocultarPara, roles),
		)
	}

	// Filtrar itens baseado em permissão E se tem subitens visíveis
	const filteredItems = items.filter((item) => {
		// Se tem permissão específica, verificar
		if (!podeAbrirRota(item.url, permissions, item.permission)) {
			return false
		}

		// Se tem subitens, verificar se pelo menos um é visível
		if (item.items && item.items.length > 0) {
			const visibleSubItems = getFilteredSubItems(item.items)
			return visibleSubItems.length > 0
		}

		// Item sem subitens e sem permissão específica (ou com permissão válida)
		return true
	})

	if (filteredItems.length === 0) {
		return null
	}

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Menu</SidebarGroupLabel>
			<SidebarMenu>
				{filteredItems.map((item) => {
					const filteredSubItems = getFilteredSubItems(item.items)
					const IconComponent = iconMap[item.icon]
					const hasSubItems = filteredSubItems.length > 0
					const isGroupActive =
						isUrlActive(item.url) ||
						filteredSubItems.some((s) => isUrlActive(s.url))

					// Item folha com destino próprio: link direto, sem `Collapsible`.
					// Sem este caso o botão abriria e fecharia um grupo vazio — era o
					// que acontecia com qualquer item sem `items`.
					if (!hasSubItems && item.url) {
						return (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									asChild
									tooltip={item.title}
									isActive={isUrlActive(item.url)}
								>
									<Link
										to={item.url}
										onMouseEnter={() => preloadRoute(item.url)}
										onFocus={() => preloadRoute(item.url)}
										onTouchStart={() => preloadRoute(item.url)}
									>
										{IconComponent && <IconComponent className='w-4 h-4' />}
										<span>{item.title}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						)
					}

					// Colapsado: achatar todos os subitens em ícones dava ~40 linhas
					// numa coluna de 48px — sem espaço na tela e sem rótulo. Aqui o grupo
					// vira um ícone só, e os filhos saem num menu ao lado.
					if (isCollapsed && hasSubItems) {
						return (
							<SidebarMenuItem key={item.title}>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										{/* Sem `tooltip`: o primitivo embrulharia o botão num
										    `Tooltip` e o `asChild` do trigger perderia o DOM. O
										    rótulo do grupo aparece no topo do próprio menu. */}
										<SidebarMenuButton
											isActive={isGroupActive}
											className='cursor-pointer'
										>
											{IconComponent && <IconComponent className='w-4 h-4' />}
											<span>{item.title}</span>
										</SidebarMenuButton>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										side='right'
										align='start'
										sideOffset={8}
										className='min-w-56'
									>
										<DropdownMenuLabel>{item.title}</DropdownMenuLabel>
										{filteredSubItems.map((subItem) => {
											const SubIconComponent = iconMap[subItem.icon]

											if (subItem.disabled) {
												return (
													<DropdownMenuItem key={subItem.title} disabled>
														{SubIconComponent && <SubIconComponent />}
														<span>{subItem.title}</span>
														<span className='ml-auto text-[10px] uppercase'>
															em breve
														</span>
													</DropdownMenuItem>
												)
											}

											return (
												<DropdownMenuItem key={subItem.title} asChild>
													<Link
														to={subItem.url}
														onMouseEnter={() => preloadRoute(subItem.url)}
														onFocus={() => preloadRoute(subItem.url)}
														onTouchStart={() => preloadRoute(subItem.url)}
														data-active={isUrlActive(subItem.url)}
														className='data-[active=true]:bg-accent data-[active=true]:font-medium'
													>
														{SubIconComponent && <SubIconComponent />}
														<span>{subItem.title}</span>
													</Link>
												</DropdownMenuItem>
											)
										})}
									</DropdownMenuContent>
								</DropdownMenu>
							</SidebarMenuItem>
						)
					}

					// Comportamento normal quando expandido
					return (
						<Collapsible
							key={item.title}
							asChild
							defaultOpen={isGroupActive}
							className='group/collapsible'
						>
							<SidebarMenuItem>
								<CollapsibleTrigger asChild>
									<SidebarMenuButton
										tooltip={item.title}
										className='cursor-pointer'
									>
										{IconComponent && <IconComponent className='w-4 h-4' />}
										<span>{item.title}</span>
										{hasSubItems && (
											<ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
										)}
									</SidebarMenuButton>
								</CollapsibleTrigger>
								{hasSubItems && (
									<CollapsibleContent>
										<SidebarMenuSub>
											{filteredSubItems.map((subItem) => {
												const SubIconComponent = iconMap[subItem.icon]

												// Tela ainda não migrada: some o link em vez de
												// mandar o usuário para um 404. O item continua
												// visível porque a permissão dele já existe — o que
												// falta é a tela.
												if (subItem.disabled) {
													return (
														<SidebarMenuSubItem key={subItem.title}>
															<SidebarMenuSubButton className='cursor-default opacity-50'>
																{SubIconComponent && (
																	<SubIconComponent className='w-4 h-4' />
																)}
																<span>{subItem.title}</span>
																<span className='ml-auto text-[10px] uppercase'>
																	em breve
																</span>
															</SidebarMenuSubButton>
														</SidebarMenuSubItem>
													)
												}

												return (
													<SidebarMenuSubItem key={subItem.title}>
														<SidebarMenuSubButton
															asChild
															isActive={isUrlActive(subItem.url)}
														>
															<Link
																to={subItem.url}
																onMouseEnter={() => preloadRoute(subItem.url)}
																onFocus={() => preloadRoute(subItem.url)}
																onTouchStart={() => preloadRoute(subItem.url)}
															>
																{SubIconComponent && (
																	<SubIconComponent className='w-4 h-4' />
																)}
																<span>{subItem.title}</span>
															</Link>
														</SidebarMenuSubButton>
													</SidebarMenuSubItem>
												)
											})}
										</SidebarMenuSub>
									</CollapsibleContent>
								)}
							</SidebarMenuItem>
						</Collapsible>
					)
				})}
			</SidebarMenu>
		</SidebarGroup>
	)
}
