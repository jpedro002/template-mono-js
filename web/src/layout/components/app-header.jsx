import { useAtom, useSetAtom } from 'jotai'
import { Plus, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from 'src/components/ui/breadcrumb'
import { Button } from 'src/components/ui/button'
import { Input } from 'src/components/ui/input'
import { Separator } from 'src/components/ui/separator'
import { SidebarTrigger } from 'src/components/ui/sidebar'
import { useHasPermission } from 'src/contexts/auth-context'
import {
	_searchCurrentInternalAtom,
	_searchDebouncedInternalAtom,
	breadcrumbAtom,
	createPermissionAtom,
	newButtonLabelAtom,
	onNewClickAtom,
	searchCurrentValueAtom,
	searchPlaceholderAtom,
	searchValueAtom,
	showHeaderAtom,
	showSearchAtom,
} from 'src/lib/atoms'

/**
 * Componente de header reutilizável com breadcrumb, pesquisa e botão "Novo"
 * Controlado por atoms do Jotai com debounce e sincronização com search params
 */
export function AppHeader() {
	const navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()
	const initializedRef = useRef(false)
	const prevSearchValueRef = useRef(null)

	const [breadcrumbs] = useAtom(breadcrumbAtom)
	const [createPermission] = useAtom(createPermissionAtom)
	const [newButtonLabel] = useAtom(newButtonLabelAtom)
	const [onNewClick] = useAtom(onNewClickAtom)
	const [searchPlaceholder] = useAtom(searchPlaceholderAtom)
	const [searchCurrentValue] = useAtom(searchCurrentValueAtom)
	const [searchValue, setSearchValue] = useAtom(searchValueAtom)
	const [showSearch] = useAtom(showSearchAtom)
	const [showHeader] = useAtom(showHeaderAtom)
	const setSearchDebouncedInternal = useSetAtom(_searchDebouncedInternalAtom)
	const setSearchCurrentInternal = useSetAtom(_searchCurrentInternalAtom)

	// Hook para verificar permissão
	const hasCreatePermission = useHasPermission(createPermission)

	// Sincronizar URL para estado na inicialização (antes do render para evitar flickering)
	useLayoutEffect(() => {
		if (!initializedRef.current) {
			const q = searchParams.get('q')
			if (q) {
				// Seta diretamente ambos atoms internos para evitar o debounce na inicialização
				setSearchCurrentInternal(q)
				setSearchDebouncedInternal(q)
				prevSearchValueRef.current = q
			}
			initializedRef.current = true
		}
	}, [searchParams, setSearchDebouncedInternal, setSearchCurrentInternal])

	// Sincronizar URL quando o valor desce do debounce (mas não na inicialização)
	useEffect(() => {
		// Só atualiza se já inicializou E se o valor realmente mudou
		// Usa comparação com || '' para tratar null/undefined como string vazia
		const currentValue = searchValue || ''
		const prevValue = prevSearchValueRef.current || ''

		if (initializedRef.current && currentValue !== prevValue) {
			prevSearchValueRef.current = currentValue
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev)
					if (currentValue) {
						next.set('q', currentValue)
					} else {
						next.delete('q')
					}
					// Resetar para página 1 quando o termo de busca muda
					if (next.has('page')) {
						next.set('page', '1')
					}
					return next
				},
				{ replace: true },
			)
		}
	}, [searchValue, setSearchParams])

	const handleNewClick = () => {
		if (onNewClick) {
			onNewClick()
		}
	}

	const handleSearchChange = (e) => {
		setSearchValue(e.target.value)
	}

	// Se o header deve ser oculto, não renderizar nada
	if (!showHeader) {
		return null
	}

	return (
		<header className='flex h-fit md:h-16 shrink-0 items-center gap-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
			<div className='flex min-w-0 flex-1 items-center gap-2 px-4'>
				<SidebarTrigger className='-ml-1 size-12' />

				{breadcrumbs.length > 0 && (
					<Separator
						orientation='vertical'
						className='mr-2 data-[orientation=vertical]:h-4'
					/>
				)}

				{/* Breadcrumb */}
				<Breadcrumb className='hidden min-w-0 md:flex'>
					<BreadcrumbList>
						{breadcrumbs.map((item, index) => (
							<div key={index} className='flex items-center'>
								{index > 0 && <BreadcrumbSeparator />}
								<BreadcrumbItem>
									{item.href ? (
										<BreadcrumbLink
											href={item.href}
											onClick={(e) => {
												e.preventDefault()
												navigate(item.href)
											}}
											className='cursor-pointer'
										>
											{item.label}
										</BreadcrumbLink>
									) : (
										<BreadcrumbPage className='text-muted-foreground'>
											{item.label}
										</BreadcrumbPage>
									)}
								</BreadcrumbItem>
							</div>
						))}
					</BreadcrumbList>
				</Breadcrumb>
			</div>

			{/* Pesquisa e Botão Novo */}
			<div className='flex min-w-0 items-center gap-2 px-4 py-2 md:py-0'>
				{/* Input de Pesquisa com Debounce e Search Params */}
				{showSearch && (
					<div className='relative flex min-w-0 flex-1 md:flex-none'>
						<Search className='absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none' />
						{/* max-w em vez de w fixo: com a sidebar aberta em tablet sobram
						    ~512px e um w-64 rígido + botão estouravam o header */}
						<Input
							placeholder={searchPlaceholder}
							value={searchCurrentValue}
							onChange={handleSearchChange}
							className='w-full min-w-0 pl-8 md:max-w-64'
						/>
					</div>
				)}

				{/* Botão Novo - com verificação de permissão */}
				{createPermission && hasCreatePermission && (
					<Button size='sm' onClick={handleNewClick} className='gap-2 shrink-0'>
						<Plus className='h-4 w-4' />
						<span className='hidden sm:inline'>{newButtonLabel}</span>
					</Button>
				)}
			</div>
		</header>
	)
}
