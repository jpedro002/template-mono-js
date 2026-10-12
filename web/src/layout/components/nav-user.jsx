import { BadgeCheck, ChevronsUpDown, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Avatar, AvatarFallback } from 'src/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu'
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from 'src/components/ui/sidebar'
import { useAuthUser } from 'src/contexts/auth-context'
import { useLogout } from 'src/services/auth'

export function NavUser() {
	const navigate = useNavigate()
	const { isMobile } = useSidebar()
	const user = useAuthUser()
	const { mutateAsync: logout } = useLogout()

	// Fallback se usuário não estiver carregado
	if (!user) {
		return null
	}

	// O `onMutate` da mutation derruba a sessão do cache antes do DELETE, então
	// o `ProtectedRoute` já tirou a tela protegida do ar enquanto a requisição
	// corria — este `navigate` só limpa o `?returnTo=` que ele deixou na URL,
	// porque sair é sair, não é voltar depois para a mesma tela.
	// `catch` vazio: o DELETE falhar não muda o destino; a sessão local caiu de
	// qualquer forma.
	const handleLogout = async () => {
		try {
			await logout()
		} catch {}
		navigate('/auth', { replace: true })
	}

	// Gerar initials do nome
	const initials =
		user.name
			?.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2) || 'US'

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size='lg'
							className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
						>
							<Avatar className='h-8 w-8 rounded-lg'>
								<AvatarFallback className='rounded-lg font-semibold'>
									{initials}
								</AvatarFallback>
							</Avatar>
							<div className='grid flex-1 text-left text-sm leading-tight'>
								<span className='truncate font-medium'>{user.name}</span>
								<span className='truncate text-xs'>{user.email}</span>
							</div>
							<ChevronsUpDown className='ml-auto size-4' />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
						side={isMobile ? 'bottom' : 'right'}
						align='end'
						sideOffset={4}
					>
						<DropdownMenuLabel className='p-0 font-normal'>
							<div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
								<Avatar className='h-8 w-8 rounded-lg'>
									<AvatarFallback className='rounded-lg font-semibold'>
										{initials}
									</AvatarFallback>
								</Avatar>
								<div className='grid flex-1 text-left text-sm leading-tight'>
									<span className='truncate font-medium'>{user.name}</span>
									<span className='truncate text-xs'>{user.email}</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem
								onClick={() => navigate('/perfil/dados-pessoais')}
								className='cursor-pointer'
							>
								<BadgeCheck className='size-4' />
								<span>Perfil</span>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleLogout} className='cursor-pointer'>
							<LogOut className='size-4' />
							<span>Sair</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
