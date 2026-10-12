import { Edit, Loader2, LogOut, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useSearchParams } from 'react-router'
import { DeleteConfirmDialog } from 'src/components/delete-confirm-dialog'
import { GenericTable } from 'src/components/table/table'
import { Badge } from 'src/components/ui/badge'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from 'src/components/ui/card'
import { Label } from 'src/components/ui/label'
import { Switch } from 'src/components/ui/switch'
import { useContagemAtivoInativo } from 'src/hooks/use-contagem-ativo-inativo'
import { useDeleteWithConfirmation } from 'src/hooks/use-delete-with-confirmation'
import { useFiltrosDaUrl } from 'src/hooks/use-filtros-da-url'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { useTableStateFromUrl } from 'src/hooks/use-table-state-from-url'
import { toast } from 'src/lib/toast'
import {
	useUsuarioAtivar,
	useUsuarioDelete,
	useUsuarioRevogarSessoes,
	useUsuariosList,
} from 'src/services/usuarios'

export const permissao = 'users:read'

const UsuariosPage = () => {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const query = searchParams.get('q') || ''

	// 🚀 Hook para sincronizar paginação com a URL (usado para a query da API)
	const { page, pageSize } = useTableStateFromUrl({ defaultPageSize: 20 })

	const { valores, definir } = useFiltrosDaUrl(['incluir_inativos'])
	const mostrarInativos = valores.incluir_inativos === 'true'

	const {
		data: usuariosData,
		isLoading,
		isFetching,
	} = useUsuariosList({
		page,
		pageSize,
		term: query,
		fields: ['name', 'login', 'email'],
		order: 'id',
		orderDirection: 'desc',
		// `fspecifics: 'active$true'` saiu daqui: quem esconde o usuário inativado
		// é o soft delete, e o filtro escondia junto quem foi desligado só pelo
		// `active` do formulário — esse sumia sem nenhuma tela para religá-lo.
		incluir_inativos: mostrarInativos || undefined,
	})

	const { ativos, inativos } = useContagemAtivoInativo(useUsuariosList, {
		chaveInativos: 'incluir_inativos',
		term: query,
		fields: ['name', 'login', 'email'],
	})

	const deleteMutation = useUsuarioDelete()

	// "Inativar" e não "Excluir": o DELETE da API sempre foi soft delete aqui, e
	// prometer que a ação não pode ser desfeita era mentira — o Reativar abaixo é
	// justamente o desfazer.
	const deleteConfirmation = useDeleteWithConfirmation(deleteMutation, {
		title: 'Inativar Usuário',
		getDescription: (usuario) =>
			`O usuário "${usuario.name}" perde o acesso e sai das listagens. Para reativá-lo depois, ligue "Mostrar inativos".`,
		confirmText: 'Sim, inativar',
		cancelText: 'Cancelar',
		onSuccess: () => {
			toast.success('Usuário inativado com sucesso!')
		},
		onError: (error) => {
			toast.error(`Erro ao inativar: ${error.message}`)
		},
	})

	const ativarMutation = useUsuarioAtivar({
		onSuccess: () => toast.success('Usuário reativado com sucesso!'),
		onError: (error) =>
			toast.error(
				error.response?.data?.message || 'Não foi possível reativar o usuário.',
			),
	})

	const revogarSessoesMutation = useUsuarioRevogarSessoes()

	// Reaproveita o diálogo de confirmação: a ação desloga o usuário em todos os
	// dispositivos, e clique acidental não pode ter esse efeito sem aviso.
	const revogarConfirmation = useDeleteWithConfirmation(
		revogarSessoesMutation,
		{
			title: 'Encerrar sessões',
			getDescription: (usuario) =>
				`"${usuario.name}" será desconectado de todos os dispositivos e precisará entrar de novo. O acesso dele continua ativo.`,
			confirmText: 'Sim, encerrar sessões',
			cancelText: 'Cancelar',
			icone: LogOut,
			onSuccess: () => toast.success('Sessões encerradas.'),
			onError: (error) =>
				toast.error(
					error.response?.data?.message ||
						'Não foi possível encerrar as sessões.',
				),
		},
	)

	useHeaderConfig({
		breadcrumbs: [{ label: 'Segurança', href: '/' }, { label: 'Usuários' }],
		showSearch: true,
		createPermission: 'users:create',
		newButtonLabel: 'Novo Usuário',
		onNewClick: () => navigate('/seguranca/usuarios/novo'),
	})

	// Configuração dos headers da tabela
	const headers = useMemo(
		() => [
			{ label: 'Nome', field: 'name' },
			{ label: 'Login', field: 'login' },
			{ label: 'Email', field: 'email' },
			{
				label: 'Perfis',
				field: 'rolesCount',
				className: 'text-center',
				type: 'custom',
				render: (value, row) => (
					<div className='flex gap-1 flex-wrap justify-center'>
						{row.userRoles?.slice(0, 2).map((userRole) => (
							<Badge key={userRole.id} variant='secondary' className='text-xs'>
								{userRole.role.name}
							</Badge>
						))}
						{row.userRoles?.length > 2 && (
							<Badge variant='outline' className='text-xs'>
								+{row.userRoles.length - 2}
							</Badge>
						)}
					</div>
				),
			},
			{ label: 'Ativo', field: 'active', type: 'boolean' },
		],
		[],
	)

	const actions = useMemo(
		() => [
			{
				label: 'Editar',
				icon: Edit,
				permission: 'users:update',
				to: (row) => `/seguranca/usuarios/${row.id}`,
			},
			{
				label: 'Inativar',
				icon: Trash2,
				permission: 'users:delete',
				variant: 'destructive',
				show: (row) => row.ativo,
				onClick: (row) => deleteConfirmation.confirmDelete(row),
			},
			// Mesma permissão que a rota da API cobra (`users:manage`).
			{
				label: 'Encerrar sessões',
				icon: LogOut,
				permission: 'users:manage',
				show: (row) => row.ativo,
				onClick: (row) => revogarConfirmation.confirmDelete(row),
			},
			// Mesma permissão do inativar: são as duas metades do mesmo
			// interruptor, e é a mesma que a rota da API cobra.
			{
				label: 'Reativar',
				icon: RotateCcw,
				permission: 'users:delete',
				show: (row) => !row.ativo,
				onClick: (row) => ativarMutation.mutate(row.id),
			},
		],
		[deleteConfirmation, ativarMutation, revogarConfirmation],
	)

	const usuarios =
		usuariosData?.data?.map((usuario) => ({
			...usuario,
			rolesCount: usuario.userRoles?.length || 0,
			// `deletedAt` só vem preenchido quando a listagem pede os inativos;
			// fora disso toda linha é ativa, que é o que o `!` já diz.
			ativo: !usuario.deletedAt,
		})) || []

	const rowCount = usuariosData?.pagination?.rowCount || 0

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-96'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
			</div>
		)
	}

	return (
		<>
			<Helmet>
				<title>Usuários</title>
			</Helmet>

			<div className='space-y-6 gap-4 p-4'>
				{/* Header da Página */}
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-3xl font-bold tracking-tight'>Usuários</h1>
						<p className='text-muted-foreground'>
							Gerencie os usuários e suas permissões do sistema
						</p>
					</div>
				</div>

				{/* Tabela */}
				<Card>
					<CardHeader>
						<div className='flex flex-wrap items-start justify-between gap-4'>
							<div>
								<CardTitle>
									Lista de Usuários
									{isFetching && (
										<Loader2 className='ml-2 h-4 w-4 animate-spin inline' />
									)}
								</CardTitle>
								<CardDescription>
									{rowCount} usuários neste recorte
								</CardDescription>
								<p className='text-muted-foreground text-sm'>
									Ativos ({(ativos ?? 0).toLocaleString('pt-BR')}) · Inativos (
									{(inativos ?? 0).toLocaleString('pt-BR')})
								</p>
							</div>
							<div className='flex items-center gap-2'>
								<Switch
									id='inativos'
									checked={mostrarInativos}
									onCheckedChange={(marcado) =>
										definir('incluir_inativos', marcado ? 'true' : '')
									}
								/>
								<Label htmlFor='inativos'>Mostrar inativos</Label>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<GenericTable
							data={usuarios}
							headers={headers}
							rowActions={actions}
							selectableRows={false}
							pagination={{
								manageUrlState: true,
								pageSize,
								rowCount,
							}}
						/>
					</CardContent>
				</Card>
			</div>

			{/* Dialog de confirmação de exclusão */}
			<DeleteConfirmDialog {...deleteConfirmation} />
			<DeleteConfirmDialog {...revogarConfirmation} />
		</>
	)
}

export default UsuariosPage
