import { Edit, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router'
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
	usePermissoesAtivar,
	usePermissoesDelete,
	usePermissoesList,
} from 'src/services/permissoes'

export const permissao = 'permissions:read'

const PermissoesPage = () => {
	const [searchParams] = useSearchParams()
	const query = searchParams.get('q') || ''

	// 🚀 Hook para sincronizar paginação com a URL (usado para a query da API)
	const { page, pageSize } = useTableStateFromUrl({ defaultPageSize: 20 })

	const { valores, definir } = useFiltrosDaUrl(['incluir_inativas'])
	const mostrarInativas = valores.incluir_inativas === 'true'

	const { data, isLoading, isFetching } = usePermissoesList({
		page,
		pageSize,
		term: query,
		fields: ['identifier', 'name', 'category'],
		incluir_inativas: mostrarInativas || undefined,
	})

	// O hook serve sem alteração aqui: ele só liga/desliga a flag e lê o
	// `rowCount`, e a API já responde `active: true` por padrão nesta listagem.
	const { ativos, inativos } = useContagemAtivoInativo(usePermissoesList, {
		chaveInativos: 'incluir_inativas',
		term: query,
		fields: ['identifier', 'name', 'category'],
	})

	const deleteMutation = usePermissoesDelete()

	// "Inativar" e não "Excluir": o DELETE da API deixou de apagar a linha —
	// `role_permissions` e `user_permissions` cascateiam, então excluir de
	// verdade retirava a permissão de toda role e de todo usuário, sem aviso.
	const deleteConfirmation = useDeleteWithConfirmation(deleteMutation, {
		title: 'Inativar Permissão',
		getDescription: (permissao) =>
			`A permissão "${permissao.identifier}" deixa de valer para quem a tem e sai das listagens. Para religá-la, ligue "Mostrar inativas".`,
		confirmText: 'Sim, inativar',
		cancelText: 'Cancelar',
		onSuccess: () => toast.success('Permissão inativada com sucesso!'),
		onError: (error) => toast.error(`Erro ao inativar: ${error.message}`),
	})

	const ativarMutation = usePermissoesAtivar({
		onSuccess: () => toast.success('Permissão reativada com sucesso!'),
		onError: (error) =>
			toast.error(
				error.response?.data?.message ||
					'Não foi possível reativar a permissão.',
			),
	})

	useHeaderConfig({
		breadcrumbs: [{ label: 'Segurança' }, { label: 'Permissões' }],

		searchPlaceholder: 'Buscar permissões...',
	})

	const headers = useMemo(
		() => [
			{
				field: 'identifier',
				label: 'Identificador',
				type: 'text',
			},
			{
				field: 'name',
				label: 'Nome',
				type: 'text',
			},
			{
				field: 'category',
				label: 'Categoria',
				type: 'custom',
				render: (value) => (
					<Badge variant='outline' className='capitalize'>
						{value}
					</Badge>
				),
			},
			{
				field: 'active',
				label: 'Status',
				type: 'boolean',
				trueLabel: 'Ativo',
				falseLabel: 'Inativo',
			},
		],
		[],
	)

	const rowActions = useMemo(
		() => [
			{
				label: 'Editar',
				icon: Edit,
				to: (row) => `/seguranca/permissoes/${row.id}`,
				permission: 'permissions:update',
			},
			{
				label: 'Inativar',
				icon: Trash2,
				permission: 'permissions:delete',
				variant: 'destructive',
				show: (row) => row.active,
				onClick: (row) => deleteConfirmation.confirmDelete(row),
			},
			// Mesma permissão do inativar: são as duas metades do mesmo
			// interruptor, e é a mesma que a rota da API cobra.
			{
				label: 'Reativar',
				icon: RotateCcw,
				permission: 'permissions:delete',
				show: (row) => !row.active,
				onClick: (row) => ativarMutation.mutate(row.id),
			},
		],
		[deleteConfirmation, ativarMutation],
	)

	const rowCount = data?.pagination?.rowCount || 0

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
				<title>Permissões</title>
			</Helmet>

			<div className='space-y-6 gap-4 p-4'>
				{/* Header */}
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						<div>
							<h1 className='text-3xl font-bold tracking-tight'>Permissões</h1>
							<p className='text-muted-foreground'>
								Gerencie as permissões do sistema
							</p>
						</div>
					</div>
				</div>

				{/* Tabela */}
				<Card>
					<CardHeader>
						<div className='flex flex-wrap items-start justify-between gap-4'>
							<div>
								<CardTitle>
									Lista de Permissões
									{isFetching && (
										<Loader2 className='ml-2 h-4 w-4 animate-spin inline' />
									)}
								</CardTitle>
								<CardDescription>
									{rowCount} permissões neste recorte
								</CardDescription>
								<p className='text-muted-foreground text-sm'>
									Ativas ({(ativos ?? 0).toLocaleString('pt-BR')}) · Inativas (
									{(inativos ?? 0).toLocaleString('pt-BR')})
								</p>
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
							data={data?.data || []}
							headers={headers}
							rowActions={rowActions}
							selectableRows={false}
							pagination={{
								pageSize: 20,
								rowCount,
								manageUrlState: true, // 🚀 A tabela gerencia a URL internamente
							}}
						/>
					</CardContent>
				</Card>
			</div>

			<DeleteConfirmDialog {...deleteConfirmation} />
		</>
	)
}

export default PermissoesPage
