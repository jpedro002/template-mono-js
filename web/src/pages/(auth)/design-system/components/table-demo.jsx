import { Copy, Edit, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { GenericTable } from 'src/components/table/table'
import { Badge } from 'src/components/ui/badge'
import { toast } from 'src/lib/toast'
import { Block, Section } from './showcase'

const FASE_VARIANT = { plan: 'plan', do: 'do', check: 'check', act: 'act' }
const FASE_LABEL = {
	plan: 'Plan',
	do: 'Do',
	check: 'Check',
	act: 'Act',
}

const DATA = [
	{
		id: 1,
		titulo: 'Reduzir evasão no 9º ano',
		fase: 'plan',
		responsavel: 'Ana Ribeiro',
		meta: 92.5,
		prazo: '2026-09-30',
		status: 'ativo',
		aprovado: true,
	},
	{
		id: 2,
		titulo: 'Recomposição de aprendizagem — Matemática',
		fase: 'do',
		responsavel: 'Bruno Cardoso',
		meta: 78,
		prazo: '2026-10-15',
		status: 'ativo',
		aprovado: true,
	},
	{
		id: 3,
		titulo: 'Auditoria de frequência',
		fase: 'check',
		responsavel: 'Camila Torres',
		meta: 64.2,
		prazo: '2026-11-01',
		status: 'ativo',
		aprovado: false,
	},
	{
		id: 4,
		titulo: 'Replanejamento da formação docente',
		fase: 'act',
		responsavel: 'Diego Almeida',
		meta: 45,
		prazo: '2026-12-20',
		status: 'inativo',
		aprovado: false,
		highlight: true,
	},
	{
		id: 5,
		titulo: 'Ciclo encerrado 2025.2',
		fase: 'check',
		responsavel: 'Ana Ribeiro',
		meta: 100,
		prazo: '2025-12-31',
		status: 'inativo',
		aprovado: true,
		expired: true,
	},
]

export function TableDemoSection() {
	const headers = useMemo(
		() => [
			{ label: 'Plano', field: 'titulo' },
			{
				label: 'Fase',
				field: 'fase',
				type: 'custom',
				render: (value) => (
					<Badge variant={FASE_VARIANT[value]}>{FASE_LABEL[value]}</Badge>
				),
			},
			{ label: 'Responsável', field: 'responsavel' },
			{
				label: 'Meta',
				field: 'meta',
				type: 'custom',
				render: (value) => (
					<span className='tabular-nums'>
						{value.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%
					</span>
				),
			},
			{ label: 'Prazo', field: 'prazo', type: 'date' },
			{ label: 'Status', field: 'status', type: 'status' },
			{
				label: 'Aprovado',
				field: 'aprovado',
				type: 'boolean',
				trueLabel: 'Sim',
				falseLabel: 'Pendente',
			},
		],
		[],
	)

	const actions = useMemo(
		() => [
			{
				label: 'Editar',
				icon: Edit,
				onClick: (row) => toast.info(`Editar: ${row.titulo}`),
			},
			{
				label: 'Duplicar',
				icon: Copy,
				onClick: (row) => toast.success(`Duplicado: ${row.titulo}`),
			},
			{
				label: 'Excluir',
				icon: Trash2,
				variant: 'destructive',
				onClick: (row) => toast.error(`Excluir: ${row.titulo}`),
			},
		],
		[],
	)

	return (
		<Section
			id='table'
			title='Table'
			description='GenericTable (TanStack Table): headers declarativos, tipos boolean/status/date/custom, rowActions e seleção.'
		>
			<Block
				title='Completa'
				hint='selectableRows + rowActions + paginação local. Linha selecionada recebe barra lateral azul.'
			>
				<GenericTable
					data={DATA}
					headers={headers}
					rowActions={actions}
					selectableRows
					pagination={{ pageSize: 10 }}
				/>
			</Block>

			<div className='grid gap-4'>
				<Block
					title='Somente leitura'
					hint='Sem seleção e sem coluna de ações.'
				>
					<GenericTable
						data={DATA.slice(0, 3)}
						headers={headers.slice(0, 4)}
						pagination={{ pageSize: 5 }}
					/>
				</Block>

				<Block title='Estado vazio' hint='Fallback de zero registros.'>
					<GenericTable data={[]} headers={headers.slice(0, 4)} />
				</Block>
			</div>
		</Section>
	)
}
