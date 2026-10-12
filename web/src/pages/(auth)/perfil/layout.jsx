import { Building2, FileText, Lock, User } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Avatar, AvatarFallback } from 'src/components/ui/avatar'
import { Card, CardContent } from 'src/components/ui/card'
import { useAuthUser } from 'src/contexts/auth-context'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { cn } from 'src/lib/utils'

const ITENS = [
	{ href: '/perfil/dados-pessoais', label: 'Dados pessoais', icon: User },
	{ href: '/perfil/seguranca', label: 'Segurança', icon: Lock },
	{
		href: '/perfil/dados-institucionais',
		label: 'Dados institucionais',
		icon: Building2,
	},
	{
		href: '/perfil/termos-politicas',
		label: 'Termos e políticas',
		icon: FileText,
	},
]

const iniciais = (nome) =>
	nome
		?.split(' ')
		.map((n) => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2) || 'US'

/**
 * Casca das quatro abas de perfil. O card da esquerda é o mesmo em todas; só o
 * da direita troca.
 *
 * O avatar é a inicial, como no menu lateral: não há upload de foto em lugar
 * nenhum da API. A tela anterior mostrava um logotipo fixo com um botão de
 * lápis que não fazia nada.
 */
export default function PerfilLayout() {
	const user = useAuthUser()

	useHeaderConfig({
		breadcrumbs: [{ label: 'Perfil' }],
		showSearch: false,
	})

	const registradoEm = user?.createdAt
		? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
				new Date(user.createdAt),
			)
		: 'Data não disponível'

	return (
		<div className='grid min-w-0 grid-cols-1 gap-6 p-4 md:grid-cols-[320px_1fr] md:p-8'>
			<Card className='h-fit'>
				<CardContent className='p-6'>
					<div className='mb-6 flex flex-col items-center text-center'>
						<Avatar className='mb-4 size-24 border-4 border-primary'>
							<AvatarFallback className='text-2xl font-semibold'>
								{iniciais(user?.name)}
							</AvatarFallback>
						</Avatar>
						<h2 className='font-semibold text-lg'>{user?.name || 'Usuário'}</h2>
						<p className='text-muted-foreground text-sm'>
							Registrado em: {registradoEm}
						</p>
					</div>

					<hr className='mx-auto mb-6 w-1/2' />

					<nav className='space-y-2'>
						{ITENS.map(({ href, label, icon: Icone }) => (
							<NavLink
								key={href}
								to={href}
								className={({ isActive }) =>
									cn(
										'relative flex items-center gap-3 rounded-lg px-4 py-3 transition-colors',
										isActive
											? 'font-bold text-primary after:absolute after:-left-6 after:top-0 after:h-full after:w-2 after:bg-primary'
											: 'text-muted-foreground hover:bg-accent hover:text-foreground',
									)
								}
							>
								<Icone className='size-5' />
								<span>{label}</span>
							</NavLink>
						))}
					</nav>
				</CardContent>
			</Card>

			<Card className='min-w-0'>
				<CardContent className='p-6'>
					<Outlet />
				</CardContent>
			</Card>
		</div>
	)
}
