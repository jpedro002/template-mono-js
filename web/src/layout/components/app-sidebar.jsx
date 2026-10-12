'use client'

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from 'src/components/ui/sidebar'
import { NavMain } from 'src/layout/components/nav-main'
import { NavUser } from 'src/layout/components/nav-user'

// Dados de navegação com permissões organizados por módulos
const data = {
	navMain: [
		{
			title: 'Segurança',
			icon: 'Shield',
			permission: null, // Módulo raiz sem permissão específica
			items: [
				{
					title: 'Usuários',
					url: '/seguranca/usuarios',
					icon: 'Users',
				},
				{
					title: 'Roles',
					url: '/seguranca/roles',
					icon: 'Shield',
				},
				{
					title: 'Permissões',
					url: '/seguranca/permissoes',
					icon: 'Lock',
				},
			],
		},
		// Telas internas do boilerplate: `/teste/*` e `/design-system`. No menu só
		// aparecem em dev (`import.meta.env.DEV`); por URL as rotas existem no
		// build e exigem `*` (superadmin).
		...(import.meta.env.DEV
			? [
					{
						title: 'Teste',
						icon: 'FileText',
						permission: null,
						items: [
							{
								title: 'Cards',
								url: '/teste/cards',
								icon: 'FileText',
							},
							{
								title: 'Design System',
								url: '/design-system',
								icon: 'Palette',
							},
							{
								title: 'Telas de erro',
								url: '/teste/erros',
								icon: 'FileText',
							},
						],
					},
				]
			: []),
	],
}

export function AppSidebar({ ...props }) {
	return (
		<Sidebar collapsible='icon' {...props}>
			<SidebarHeader className='flex flex-row items-center'>
				<div className='grid flex-1 text-left leading-tight'>
					<span className='truncate font-semibold text-body'>Template</span>
				</div>
			</SidebarHeader>
			{/* `SidebarContent` do shadcn zera o overflow no modo ícone. Mesmo com
			    um ícone por grupo, em tela baixa os últimos grupos ficariam
			    cortados e inalcançáveis. */}
			<SidebarContent className='group-data-[collapsible=icon]:overflow-y-auto'>
				<NavMain items={data.navMain} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	)
}
