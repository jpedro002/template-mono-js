import { Helmet } from 'react-helmet-async'
import { useAuthUser } from 'src/contexts/auth-context'

export default function Page() {
	const user = useAuthUser()

	return (
		<>
			<Helmet>
				<title>Início</title>
			</Helmet>
			<div className='space-y-2 p-4'>
				<h1 className='text-3xl font-bold tracking-tight'>
					Olá{user?.name ? `, ${user.name}` : ''}
				</h1>
				<p className='text-muted-foreground'>
					Ponto de partida do template. Substitua esta página.
				</p>
			</div>
		</>
	)
}
