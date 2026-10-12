import { useMemo, useRef, useState } from 'react'
import Form from 'src/components/Form/FormWeb'
import { statusField } from 'src/components/Form/fieldPresets'
import { Badge } from 'src/components/ui/badge'
import { Button } from 'src/components/ui/button'
import { toast } from 'src/lib/toast'
import { Block, Section } from './showcase'

const FASES = [
	{ label: 'Plan — Planejar', value: 'plan' },
	{ label: 'Do — Executar', value: 'do' },
	{ label: 'Check — Verificar', value: 'check' },
	{ label: 'Act — Ajustar', value: 'act' },
]

const RESPONSAVEIS = [
	{ label: 'Ana Ribeiro', value: '1' },
	{ label: 'Bruno Cardoso', value: '2' },
	{ label: 'Camila Torres', value: '3' },
	{ label: 'Diego Almeida', value: '4' },
]

export function FormDemoSection() {
	const formRef = useRef(null)
	const [submitted, setSubmitted] = useState(null)

	const fields = useMemo(
		() => [
			{ type: 'label', label: 'Identificação' },
			{
				name: 'titulo',
				label: 'Título do plano',
				type: 'text',
				required: true,
				cols: 8,
				placeholder: 'Ex.: Reduzir evasão no 9º ano',
			},
			{
				name: 'codigo',
				label: 'Código',
				type: 'text',
				cols: 4,
				editable: false,
				defaultValue: 'ITEM-0142',
			},
			{
				name: 'email',
				label: 'E-mail do responsável',
				type: 'email',
				required: true,
				cols: 6,
			},
			{ name: 'telefone', label: 'Telefone', type: 'tel', cols: 3 },
			{
				name: 'senha',
				label: 'Senha de liberação',
				type: 'password',
				cols: 3,
			},
			{
				name: 'descricao',
				label: 'Descrição',
				type: 'text',
				multiline: true,
				minHeight: 96,
				cols: 12,
				description: 'Contextualize o problema e a hipótese de causa raiz.',
			},

			{ type: 'label', label: 'Metas e prazos' },
			{
				name: 'meta',
				label: 'Meta (%)',
				type: 'number',
				required: true,
				cols: 3,
			},
			{ name: 'orcamento', label: 'Orçamento', type: 'currency', cols: 3 },
			{
				name: 'inicio',
				label: 'Início',
				type: 'date',
				required: true,
				cols: 3,
			},
			{ name: 'revisao', label: 'Revisão', type: 'datetime', cols: 3 },

			{ type: 'label', label: 'Classificação' },
			{
				name: 'fase',
				label: 'Fase atual',
				type: 'picker',
				options: FASES,
				required: true,
				cols: 4,
			},
			{
				name: 'responsavel',
				label: 'Responsável',
				type: 'searchPicker',
				options: RESPONSAVEIS,
				cols: 4,
			},
			{
				name: 'apoiadores',
				label: 'Apoiadores',
				type: 'searchPicker',
				options: RESPONSAVEIS,
				multiSelect: true,
				cols: 4,
			},
			{
				name: 'prioridade',
				label: 'Prioridade',
				type: 'radio',
				options: [
					{ label: 'Alta', value: 'alta' },
					{ label: 'Média', value: 'media' },
					{ label: 'Baixa', value: 'baixa' },
				],
				cols: 6,
			},
			{
				name: 'eixos',
				label: 'Eixos impactados',
				type: 'checkboxGroup',
				options: [
					{ label: 'Aprendizagem', value: 'aprendizagem' },
					{ label: 'Frequência', value: 'frequencia' },
					{ label: 'Gestão', value: 'gestao' },
				],
				cols: 6,
			},
			{
				name: 'temIndicador',
				label: 'Possui indicador quantitativo?',
				type: 'boolean',
				cols: 6,
			},
			{
				name: 'indicador',
				label: 'Nome do indicador',
				type: 'text',
				cols: 6,
				visibleIf: { field: 'temIndicador', operator: 'equals', value: true },
				description:
					'Visível apenas quando o campo anterior é "Sim" (visibleIf).',
			},

			{ type: 'label', label: 'Ações' },
			{
				name: 'acoes',
				label: 'Plano de ação (5W2H)',
				type: 'fieldArray',
				minRows: 1,
				maxRows: 5,
				addButtonLabel: 'Adicionar ação',
				fields: [
					{ name: 'oque', label: 'O quê', type: 'text', cols: 6 },
					{ name: 'quem', label: 'Quem', type: 'text', cols: 6 },
					{ name: 'quando', label: 'Quando', type: 'date', cols: 6 },
					{ name: 'quanto', label: 'Quanto', type: 'currency', cols: 6 },
				],
			},

			{ type: 'label', label: 'Publicação' },
			{
				name: 'aceite',
				label: 'Confirmo a revisão dos dados',
				type: 'checkbox',
				required: true,
				description: 'Obrigatório para submeter o plano.',
			},
			statusField(),
			{ name: 'origemId', type: 'hidden', defaultValue: 42 },
		],
		[],
	)

	return (
		<Section
			id='form'
			title='Form'
			description='Form declarativo (src/components/Form/FormWeb.jsx): schema Zod e defaults gerados a partir do array fields.'
		>
			<Block
				title='Todos os tipos de campo'
				hint='label · text · email · tel · password · multiline · number · currency · date · datetime · picker · searchPicker (single/multi) · radio · checkboxGroup · boolean · checkbox · switch · fieldArray · hidden · visibleIf'
			>
				<div className='flex flex-wrap gap-2 pb-2'>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={() => formRef.current?.reset()}
					>
						reset() via ref
					</Button>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={() =>
							formRef.current?.setValue('titulo', 'Plano preenchido via ref')
						}
					>
						setValue() via ref
					</Button>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={() =>
							toast.info(JSON.stringify(formRef.current?.getValues()))
						}
					>
						getValues() via ref
					</Button>
				</div>

				<Form
					ref={formRef}
					fields={fields}
					submitLabel='Salvar plano'
					validationMode='onSubmit'
					onSubmit={(data) => {
						setSubmitted(data)
						toast.success('Formulário validado com sucesso!')
					}}
				/>

				{submitted && (
					<div className='space-y-2 pt-4'>
						<Badge variant='success'>onSubmit</Badge>
						<pre className='overflow-x-auto rounded-lg border border-border bg-background p-4 text-caption'>
							{JSON.stringify(submitted, null, 2)}
						</pre>
					</div>
				)}
			</Block>
		</Section>
	)
}
