import { ChevronLeft, FileText } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import Form from 'src/components/Form/FormWeb'
import { Button } from 'src/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from 'src/components/ui/card'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { toast } from 'src/lib/toast'
import { useCards, useCardsCreate, useCardsUpdate } from 'src/services/cards'
import { z } from 'zod'

// Tela interna de quem desenvolve. `*` como permissão declarada é o gate mais
// estreito que existe aqui: `temPermissao` só a aprova para quem tem o
// wildcard, e não há recurso nem ação a casar por partes. O item de menu
// continua atrás de `import.meta.env.DEV`; por URL, em dev ou em produção,
// abre para superadmin e mais ninguém.
export const permissao = '*'

// =========================
// SCHEMA ZOD
// =========================
const cardFormSchema = z.object({
	title: z
		.string()
		.min(1, 'Título é obrigatório')
		.min(3, 'Título deve ter no mínimo 3 caracteres')
		.max(200, 'Título não pode ter mais de 200 caracteres'),
	description: z
		.string()
		.max(1000, 'Descrição não pode ter mais de 1000 caracteres')
		.optional()
		.or(z.literal('')),
})

const CardDetailsPage = () => {
	const { id } = useParams()
	const navigate = useNavigate()
	const isEditing = id !== 'novo'
	const [isSubmitting, setIsSubmitting] = useState(false)

	useHeaderConfig({
		breadcrumbs: [
			{ label: 'Teste', href: '/' },
			{ label: 'Cards', href: '/teste/cards' },
			{ label: isEditing ? 'Editar Card' : 'Novo Card' },
		],
		showSearch: false,
	})

	// Buscar dados do card (se estiver editando)
	const { data: cardData, isLoading: isLoadingCard } = useCards(id, {
		enabled: isEditing,
	})

	console.log(JSON.stringify(cardData, null, 2))

	// Mutations
	const createMutation = useCardsCreate()
	const updateMutation = useCardsUpdate()

	// Configuração dos campos do formulário
	const fields = [
		{
			name: 'title',
			label: 'Título',
			type: 'text',
			placeholder: 'Ex: Título do card',
			required: true,
			cols: 6,
		},
		{
			name: 'description',
			label: 'Descrição',
			type: 'text',
			multiline: true,
			placeholder: 'Digite uma descrição (opcional)',
			cols: 6,
		},
	]

	// Submeter formulário
	const onSubmit = async (data) => {
		setIsSubmitting(true)
		try {
			// Preparar dados
			const payload = {
				title: data.title,
				description: data.description || null,
			}

			if (isEditing) {
				// Atualizar card
				await updateMutation.mutateAsync({ id, data: payload })
				toast.success('Card atualizado com sucesso!')
			} else {
				// Criar card
				await createMutation.mutateAsync(payload)
				toast.success('Card criado com sucesso!')
			}

			navigate('/teste/cards')
		} catch (error) {
			toast.error(error.response?.data?.error || 'Erro ao salvar card')
		} finally {
			setIsSubmitting(false)
		}
	}

	if (isLoadingCard) {
		return (
			<div className='flex items-center justify-center h-96'>
				<div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
			</div>
		)
	}

	return (
		<div className='min-h-full'>
			<div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8'>
				{/* Breadcrumb/Voltar */}
				<Button
					variant='ghost'
					className='mb-6 -ml-2'
					onClick={() => navigate('/teste/cards')}
				>
					<ChevronLeft className='h-4 w-4 mr-2' />
					Voltar para Cards
				</Button>

				<div className='space-y-6'>
					{/* Card de Informações */}
					<Card>
						<CardHeader>
							<CardTitle className='flex items-center gap-2'>
								<FileText className='h-5 w-5 text-primary' />
								{isEditing ? 'Editar Card' : 'Criar Novo Card'}
							</CardTitle>
							<CardDescription>Preencha as informações do card</CardDescription>
						</CardHeader>
						<CardContent>
							<Form
								fields={fields}
								schema={cardFormSchema}
								data={cardData}
								onSubmit={onSubmit}
								isLoading={isSubmitting}
								submitLabel={isSubmitting ? 'Salvando...' : 'Salvar Card'}
								showRequiredIndicator={true}
							/>
						</CardContent>
					</Card>

					{/* Botão Cancelar */}
					<div className='flex justify-start'>
						<Button
							type='button'
							variant='outline'
							onClick={() => navigate('/teste/cards')}
						>
							Cancelar
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

export default CardDetailsPage
