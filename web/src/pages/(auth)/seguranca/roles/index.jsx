import { Edit, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router'
import { DeleteConfirmDialog } from 'src/components/delete-confirm-dialog'
import { GenericTable } from 'src/components/table/table'
import { Button } from 'src/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from 'src/components/ui/card'
import { Label } from 'src/components/ui/label'
import { Switch } from 'src/components/ui/switch'
import { useHasPermission } from 'src/contexts/auth-context'
import { useDeleteWithConfirmation } from 'src/hooks/use-delete-with-confirmation'
import { useFiltrosDaUrl } from 'src/hooks/use-filtros-da-url'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { toast } from 'src/lib/toast'
import {
	useRolesAtivar,
	useRolesDelete,
	useRolesList,
} from 'src/services/roles'

export const permissao = 'roles:read'

const RolesPage = () => {
	const navigate = useNavigate()

	const hasPermissionToCreateRole = useHasPermission('roles:create')

	const { valores, definir } = useFiltrosDaUrl(['incluir_inativas'])
	const mostrarInativas = valores.incluir_inativas === 'true'

	// Buscar dados da API
	const {
		data: rolesData,
		isLoading,
		isFetching,
	} = useRolesList({ incluir_inativas: mostrarInativas || undefined })

	// Configurar delete com confirmação
	const deleteMutation = useRolesDelete()

	// "Inativar" e não "Excluir": o DELETE da API deixou de apagar a linha —
	// `user_roles` e `role_permissions` cascateiam, então excluir de verdade
	// tirava a role de todos os usuários que a tinham, sem aviso e sem desfazer.
	const deleteConfirmation = useDeleteWithConfirmation(deleteMutation, {
		title: 'Inativar Role',
		getDescription: (role) =>
			`A role "${role.name}" para de conceder suas permissões e sai das listagens. Quem a tem continua vinculado; para religá-la, ligue "Mostrar inativas".`,
		confirmText: 'Sim, inativar',
		cancelText: 'Cancelar',
		onSuccess: () => {
			toast.success('Role inativada com sucesso!')
		},
		onError: (error) => {
			toast.error(`Erro ao inativar: ${error.message}`)
		},
	})

	const ativarMutation = useRolesAtivar({
		onSuccess: () => toast.success('Role reativada com sucesso!'),
		onError: (error) =>
			toast.error(
				error.response?.data?.message || 'Não foi possível reativar a role.',
			),
	})

	useHeaderConfig({
		breadcrumbs: [{ label: 'Segurança', href: '/' }, { label: 'Roles' }],
		showSearch: false,
	})

	// Configuração dos headers da tabela
	const headers = useMemo(
		() => [
			{ label: 'Nome', field: 'name' },
			{
				label: 'Permissões',
				field: 'permissionsCount',
				className: 'text-center',
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
				permission: 'roles:update',
				to: (row) => `/seguranca/roles/${row.id}`,
			},
			{
				label: 'Inativar',
				icon: Trash2,
				permission: 'roles:delete',
				variant: 'destructive',
				show: (row) => row.active,
				onClick: (row) => deleteConfirmation.confirmDelete(row),
			},
			// Mesma permissão do inativar: são as duas metades do mesmo
			// interruptor, e é a mesma que a rota da API cobra.
			{
				label: 'Reativar',
				icon: RotateCcw,
				permission: 'roles:delete',
				show: (row) => !row.active,
				onClick: (row) => ativarMutation.mutate(row.id),
			},
		],
		[deleteConfirmation, ativarMutation],
	)

	// Processar dados para a tabela
	const roles =
		rolesData?.data?.map((role) => ({
			...role,
			permissionsCount: role.rolePermissions?.length || 0,
		})) || []

	const rowCount = rolesData?.pagination?.rowCount || 0

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
				<title>Roles</title>
			</Helmet>

			<div className='space-y-6 gap-4 p-4'>
				{/* Header da Página */}
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-3xl font-bold tracking-tight'>Roles</h1>
						<p className='text-muted-foreground'>
							Gerencie as funções e permissões do sistema
						</p>
					</div>
					{hasPermissionToCreateRole && (
						<Button asChild>
							<Link to='/seguranca/roles/novo'>
								<Plus className='mr-2 h-4 w-4' />
								Nova Role
							</Link>
						</Button>
					)}
				</div>

				{/* Tabela */}
				<Card>
					<CardHeader>
						<div className='flex flex-wrap items-start justify-between gap-4'>
							<div>
								<CardTitle>
									Lista de Roles
									{isFetching && (
										<Loader2 className='ml-2 h-4 w-4 animate-spin inline' />
									)}
								</CardTitle>
								<CardDescription>
									{rowCount} roles neste recorte
								</CardDescription>
							</div>
							<div className='flex items-center gap-2'>
								<Switch
									id='inativas'
									checked={mostrarInativas}
									onCheckedChange={(marcado) =>
										definir('incluir_inativas', marcado ? 'true' : '')
									}
								/>
								<Label htmlFor='inativas'>Mostrar inativas</Label>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<GenericTable
							data={roles}
							headers={headers}
							rowActions={actions}
							selectableRows={false}
						/>
					</CardContent>
				</Card>
			</div>

			{/* Dialog de confirmação de exclusão */}
			<DeleteConfirmDialog {...deleteConfirmation} />
		</>
	)
}

export default RolesPage
