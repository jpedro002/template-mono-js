import { Bomb, FileWarning, SearchX, ShieldX, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, Navigate } from 'react-router'
import { Button } from 'src/components/ui/button'
import { useHeaderConfig } from 'src/hooks/use-header-config'

// Vale o mesmo gate das outras telas internas (`/teste/cards`, `/design-system`):
// só superadmin por URL. Além disso, fora de dev a tela nem renderiza.
export const permissao = '*'

/**
 * Vitrine das telas de erro: dispara cada tipo de falha de propósito para ver
 * o `errorElement` raiz (`src/pages/error.jsx`) e a 404 sem precisar quebrar
 * código de verdade. Só existe em dev.
 */

const ERROS = {
	render: () => new ReferenceError('Building2 is not defined'),
	chunk: () =>
		new TypeError(
			'Failed to fetch dynamically imported module: http://localhost/src/pages/exemplo.jsx',
		),
	permissao: () =>
		Object.assign(new Error('Forbidden'), {
			status: 403,
			statusText: 'Forbidden',
		}),
}

function Explode({ tipo }) {
	throw ERROS[tipo]()
}

const CASOS = [
	{
		tipo: 'render',
		icone: Bomb,
		titulo: 'Crash de render',
		texto: 'Um componente quebra no meio da tela, como um import esquecido.',
	},
	{
		tipo: 'chunk',
		icone: WifiOff,
		titulo: 'Versão antiga após deploy',
		texto:
			'1º clique: recarrega sozinho, como em produção. 2º clique em até 10 s: mostra a tela (a trava contra laço já está ligada).',
	},
	{
		tipo: 'permissao',
		icone: ShieldX,
		titulo: 'Acesso negado (403)',
		texto: 'Resposta de erro com status, sem detalhes técnicos.',
	},
]

export default function Page() {
	const [tipo, setTipo] = useState(null)

	useHeaderConfig({
		breadcrumbs: [{ label: 'Teste' }, { label: 'Telas de erro' }],
		showSearch: false,
	})

	if (!import.meta.env.DEV) return <Navigate to='/404' replace />

	return (
		<div className='mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6'>
			<Helmet>
				<title>Telas de erro (dev)</title>
			</Helmet>
			{tipo && <Explode tipo={tipo} />}

			<div>
				<p className='text-overline text-muted-foreground uppercase'>
					Só em desenvolvimento
				</p>
				<h1 className='text-h1'>Telas de erro</h1>
				<p className='text-body text-muted-foreground'>
					Cada botão provoca a falha de verdade, então o que aparece é
					exatamente o que o usuário veria. A URL não muda: “Recarregar” na tela
					de erro traz de volta para cá.
				</p>
			</div>

			<div className='grid gap-4 sm:grid-cols-2'>
				{CASOS.map(({ tipo: t, icone: Icone, titulo, texto }) => (
					<div
						key={t}
						className='flex flex-col gap-4 rounded-xl border bg-card p-5'
					>
						<div className='flex items-start gap-3'>
							<span className='grid size-10 shrink-0 place-items-center rounded-lg bg-act text-act-fg'>
								<Icone className='size-5' aria-hidden />
							</span>
							<div>
								<p className='font-semibold'>{titulo}</p>
								<p className='text-caption text-muted-foreground'>{texto}</p>
							</div>
						</div>
						<Button
							variant='outline'
							className='mt-auto'
							onClick={() => setTipo(t)}
						>
							<FileWarning />
							Disparar
						</Button>
					</div>
				))}

				<div className='flex flex-col gap-4 rounded-xl border bg-card p-5'>
					<div className='flex items-start gap-3'>
						<span className='grid size-10 shrink-0 place-items-center rounded-lg bg-plan text-plan-fg'>
							<SearchX className='size-5' aria-hidden />
						</span>
						<div>
							<p className='font-semibold'>Página não encontrada</p>
							<p className='text-caption text-muted-foreground'>
								Navega para um endereço que não existe e cai na 404.
							</p>
						</div>
					</div>
					<Button variant='outline' className='mt-auto' asChild>
						<Link to='/teste/rota-que-nao-existe'>
							<SearchX />
							Abrir 404
						</Link>
					</Button>
				</div>
			</div>
		</div>
	)
}
