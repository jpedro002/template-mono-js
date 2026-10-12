import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import Form from 'src/components/Form/FormWeb'
import { Button } from 'src/components/ui/button'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { usePermissoes, usePermissoesUpdate } from 'src/services/permissoes'

const permissionFields = [
	{
		name: 'identifier',
		label: 'Identificador',
		type: 'text',
		placeholder: 'ex: users:read',
		required: true,
		cols: 6,
		description: 'Identificador único da permissão (ex: users:read)',
	},
	{
		name: 'name',
		label: 'Nome',
		type: 'text',
		placeholder: 'ex: Ler Usuários',
		required: true,
		cols: 6,
		description: 'Nome descritivo da permissão',
	},
	{
		name: 'description',
		label: 'Descrição',
		type: 'text',
		multiline: true,
		placeholder: 'Descreva o propósito desta permissão...',
		required: false,
		cols: 12,
	},
	{
		name: 'category',
		label: 'Categoria',
		type: 'text',
		placeholder: 'ex: usuarios, roles, permissoes',
		required: true,
		cols: 6,
		description: 'Categoria que agrupa permissões relacionadas',
	},
	{
		name: 'active',
		label: 'Ativa',
		type: 'switch',
		required: false,
		cols: 6,
		description: 'Define se a permissão está ativa no sistema',
	},
]

// Tela só de edição (não há `/novo`): carrega por `GET /:id`
// (`permissions:read`) e grava por `PUT` (`permissions:update`). A união com
// create deixava entrar quem só cria e via o aviso "sem permissão" no lugar.
export const permissao = ['permissions:read', 'permissions:update']
export const permissaoTodas = true

const PermissaoPage = () => {
	const { id } = useParams()
	const navigate = useNavigate()

	// Buscar dados da permissão
	// Com a flag: sem ela o `GET /:id` esconde a permissão desligada e o Editar
	// responderia 404.
	const {
		data: permission,
		isLoading,
		error,
	} = usePermissoes(id, { filters: { incluir_inativas: true } })

	// Hook para atualizar
	const updateMutation = usePermissoesUpdate({
		filters: { incluir_inativas: true },
	})

	useHeaderConfig({
		breadcrumbs: [
			{ label: 'Segurança', href: '/' },
			{ label: 'Permissões', href: '/seguranca/permissoes' },
			{ label: permission ? permission.identifier : 'Carregando...' },
		],
		showSearch: false,
	})

	const handleSubmit = (formData) => {
		updateMutation.mutate(
			{ id, data: formData },
			{
				onSuccess: () => {
					toast.success('Permissão atualizada com sucesso!')
					// Recarrega dados ou volta para lista
					setTimeout(() => navigate(-1), 1500)
				},
				onError: (err) => {
					toast.error(
						err?.response?.data?.message || 'Erro ao atualizar permissão',
					)
				},
			},
		)
	}

	if (isLoading) {
		return <div className='p-6'>Carregando...</div>
	}

	if (error) {
		return (
			<div className='p-6'>
				<div className='text-red-500'>
					Erro ao carregar permissão: {error?.message}
				</div>
				<Button onClick={() => navigate(-1)} className='mt-4'>
					Voltar
				</Button>
			</div>
		)
	}

	return (
		<div className='space-y-6 gap-4 p-4'>
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>
						Editar Permissão
					</h1>
					<p className='text-muted-foreground mt-1'>ID: {id}</p>
				</div>
				<Button variant='outline' asChild>
					<Link to='/seguranca/permissoes'>
						<ArrowLeft className='h-4 w-4 mr-2' /> Voltar
					</Link>
				</Button>
			</div>

			<div className='bg-white rounded-lg border p-6'>
				<Form
					fields={permissionFields}
					data={permission}
					onSubmit={handleSubmit}
					isLoading={updateMutation.isPending}
					submitLabel='Salvar Alterações'
					showSubmitButton={true}
				/>
			</div>
		</div>
	)
}
export default PermissaoPage
