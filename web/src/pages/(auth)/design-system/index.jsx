import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Badge } from 'src/components/ui/badge'
import { Button } from 'src/components/ui/button'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { ControlsSection } from './components/controls'
import { FormDemoSection } from './components/form-demo'
import { OverlaysSection } from './components/overlays'
import { TableDemoSection } from './components/table-demo'
import { TokensSection } from './components/tokens'

// Tela interna de quem desenvolve. `*` como permissão declarada é o gate mais
// estreito que existe aqui: `temPermissao` só a aprova para quem tem o
// wildcard, e não há recurso nem ação a casar por partes. O item de menu
// continua atrás de `import.meta.env.DEV`; por URL, em dev ou em produção,
// abre para superadmin e mais ninguém.
export const permissao = '*'

const NAV = [
	{ id: 'tokens', label: 'Tokens' },
	{ id: 'controles', label: 'Controles' },
	{ id: 'overlays', label: 'Overlays' },
	{ id: 'form', label: 'Form' },
	{ id: 'table', label: 'Table' },
]

const DesignSystemPage = () => {
	const [dark, setDark] = useState(false)

	useHeaderConfig({
		breadcrumbs: [{ label: 'Design System' }],
		showSearch: false,
	})

	// Toggle local: valida os tokens do tema escuro sem persistir fora da página.
	useEffect(() => {
		const root = document.documentElement
		root.classList.toggle('dark', dark)
		return () => root.classList.remove('dark')
	}, [dark])

	return (
		<>
			<Helmet>
				<title>Design System</title>
			</Helmet>

			<div className='space-y-8 p-4'>
				<header className='space-y-4'>
					<div className='flex flex-wrap items-start justify-between gap-4'>
						<div className='space-y-1'>
							<div className='flex items-center gap-2'>
								<h1 className='text-display'>Design System</h1>
								<Badge variant='brand'>v4.0.0</Badge>
							</div>
							<p className='text-body text-muted-foreground'>
								Referência viva dos tokens e componentes. Tailwind v4 CSS-first
								— tudo declarado em{' '}
								<code className='rounded-sm bg-muted px-1 py-0.5 text-caption'>
									src/index.css
								</code>
								.
							</p>
						</div>
						<Button variant='outline' onClick={() => setDark((v) => !v)}>
							{dark ? <Sun /> : <Moon />}
							{dark ? 'Tema claro' : 'Tema escuro'}
						</Button>
					</div>

					<nav className='flex flex-wrap gap-2'>
						{NAV.map((n) => (
							<Button key={n.id} variant='secondary' size='sm' asChild>
								<a href={`#${n.id}`}>{n.label}</a>
							</Button>
						))}
					</nav>
				</header>

				<TokensSection />
				<ControlsSection />
				<OverlaysSection />
				<FormDemoSection />
				<TableDemoSection />
			</div>
		</>
	)
}

export default DesignSystemPage
