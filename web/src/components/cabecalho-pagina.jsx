import { CardDescription, CardTitle } from 'src/components/ui/card'
import { Label } from 'src/components/ui/label'
import { cn } from 'src/lib/utils'

/** Classes do `Card` que recebe o `CabecalhoPagina`: borda de destaque do cabeçalho. */
export const CARTAO_CABECALHO =
	'overflow-hidden border-l-4 border-l-brand-strong'

/**
 * Etiquetas de contexto fixo (ex.: unidade, status): o que não é escolha
 * vira texto, não filtro. `tom: 'perigo'` pinta a etiqueta de destrutivo.
 *
 * @param {{ icone: import('react').ComponentType, rotulo?: string, valor: string, tom?: 'perigo' }[]} props.itens
 */
export function Etiquetas({ itens, className }) {
	if (!itens.length) return null

	return (
		<div className={cn('flex flex-wrap gap-2', className)}>
			{itens.map(({ icone: Icone, rotulo, valor, tom }) => (
				<span
					key={`${rotulo ?? ''}${valor}`}
					className={cn(
						'inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-2 text-body',
						tom === 'perigo'
							? 'border-destructive/30 bg-destructive/5 text-destructive'
							: 'border-border bg-background',
					)}
				>
					<Icone
						className={cn(
							'size-4',
							tom === 'perigo' ? 'text-destructive' : 'text-muted-foreground',
						)}
					/>
					{rotulo && (
						<span
							className={
								tom === 'perigo'
									? 'text-destructive/80'
									: 'text-muted-foreground'
							}
						>
							{rotulo}
						</span>
					)}
					<span
						className={cn(
							'font-semibold',
							tom === 'perigo' ? 'text-destructive' : 'text-foreground',
						)}
					>
						{valor}
					</span>
				</span>
			))}
		</div>
	)
}

/**
 * Cabeçalho das telas de cadastro no desenho do `CabecalhoEtapa` das telas do
 * ciclo: o selo leva o ícone da tela no lugar do número da fase. Vai dentro de
 * um `CardHeader` de um `Card` com `CARTAO_CABECALHO`.
 */
export function CabecalhoPagina({
	icone: Icone,
	secao,
	titulo,
	descricao,
	contexto = [],
	acoes,
}) {
	return (
		<div className='flex flex-wrap items-start gap-4'>
			<span className='flex size-12 shrink-0 items-center justify-center rounded-xl border border-brand-strong/30 bg-brand-light text-brand-text'>
				<Icone className='size-6' />
			</span>
			<div className='min-w-0 flex-1'>
				{secao && (
					<p className='text-overline text-brand-text uppercase'>{secao}</p>
				)}
				<CardTitle className='mt-0.5 break-words text-display'>
					{titulo}
				</CardTitle>
				{descricao && (
					<CardDescription className='mt-1'>{descricao}</CardDescription>
				)}
				<Etiquetas itens={contexto} className='mt-3' />
			</div>
			{acoes && (
				<div className='flex shrink-0 flex-wrap items-center gap-2'>
					{acoes}
				</div>
			)}
		</div>
	)
}

/** Cabeçalho de um bloco dentro da tela: ícone num quadrado, título e contagem. */
export function CabecalhoSecao({
	icone: Icone,
	titulo,
	descricao,
	contagem,
	acoes,
}) {
	return (
		<div className='flex flex-wrap items-start gap-3'>
			<span className='flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground'>
				<Icone className='size-5' />
			</span>
			<div className='min-w-0 flex-1'>
				<CardTitle className='flex items-center gap-2 text-h2'>
					{titulo}
					{contagem !== undefined && (
						<span className='rounded-full bg-muted px-2 py-0.5 font-semibold text-caption text-muted-foreground tabular-nums'>
							{contagem}
						</span>
					)}
				</CardTitle>
				{descricao && (
					<CardDescription className='mt-0.5'>{descricao}</CardDescription>
				)}
			</div>
			{acoes && (
				<div className='flex shrink-0 flex-wrap items-center gap-2'>
					{acoes}
				</div>
			)}
		</div>
	)
}

/** Linha de filtros rotulados abaixo do título, como no Executar Ação. */
export function BarraDeFiltros({ children, className }) {
	return (
		<div
			className={cn(
				'flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:gap-y-6',
				className,
			)}
		>
			{children}
		</div>
	)
}

export function CampoDeFiltro({ rotulo, htmlFor, children, className }) {
	return (
		<div className={cn('w-full min-w-[200px] md:w-auto md:flex-1', className)}>
			<Label htmlFor={htmlFor} className='mb-2 block'>
				{rotulo}
			</Label>
			{children}
		</div>
	)
}
