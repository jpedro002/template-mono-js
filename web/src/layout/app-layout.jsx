import { useState } from 'react'
import { Outlet } from 'react-router'
import { SidebarInset, SidebarProvider } from 'src/components/ui/sidebar'
import { AppHeader } from 'src/layout/components/app-header'
import { AppSidebar } from 'src/layout/components/app-sidebar'

// O primitivo do shadcn grava o estado num cookie, mas quem o lê é o servidor
// do Next para passar `defaultOpen` — aqui não há servidor, então o cookie era
// escrito e nunca lido. Controlamos o provider e guardamos no localStorage.
const CHAVE_SIDEBAR = 'sidebar_state'

const lerEstadoSalvo = () => {
	const salvo = localStorage.getItem(CHAVE_SIDEBAR)
	if (salvo !== null) return salvo === 'true'
	// Sem preferência gravada: colapsada abaixo de lg (1024px).
	return window.innerWidth >= 1024
}

export const AppLayout = () => {
	const [sidebarAberta, setSidebarAberta] = useState(lerEstadoSalvo)

	const alterarSidebar = (aberta) => {
		setSidebarAberta(aberta)
		localStorage.setItem(CHAVE_SIDEBAR, String(aberta))
	}

	return (
		<SidebarProvider open={sidebarAberta} onOpenChange={alterarSidebar}>
			<AppSidebar />
			{/* min-w-0: sem isso o inset é um flex item com min-width:auto e
			    qualquer conteúdo largo (tabela, select nativo) empurra a página
			    inteira em vez de virar scroll interno */}
			<SidebarInset className='min-w-0'>
				<AppHeader />
				<main className='flex min-w-0 flex-1 flex-col'>
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	)
}
