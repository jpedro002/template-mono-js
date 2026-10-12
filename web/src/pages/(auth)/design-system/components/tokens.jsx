import { Block, Label, Row, Section, Swatch } from './showcase'

const BRAND = [
	{ cls: 'bg-brand', name: 'brand', note: 'ação primária · 5.26:1 c/ branco' },
	{ cls: 'bg-brand-strong', name: 'brand-strong', note: 'borda/anel · 4.96:1' },
	{ cls: 'bg-brand-text', name: 'brand-text', note: 'texto · 6.26:1 s/ brand-light' },
	{ cls: 'bg-brand-hover', name: 'brand-hover', note: 'hover · 6.82:1' },
	{ cls: 'bg-brand-active', name: 'brand-active', note: 'pressed · 8.84:1' },
	{ cls: 'bg-brand-light', name: 'brand-light', note: 'superfície ativa' },
	{ cls: 'bg-neutral', name: 'neutral', note: 'contorno · 3.43:1' },
	{ cls: 'bg-neutral-light', name: 'neutral-light', note: 'trilha/chip' },
	{ cls: 'bg-success', name: 'success', note: 'sucesso · 7.69:1' },
]

const SEMANTIC = [
	{ cls: 'bg-background', name: 'background' },
	{ cls: 'bg-card', name: 'card' },
	{ cls: 'bg-primary', name: 'primary', note: '= brand' },
	{ cls: 'bg-secondary', name: 'secondary' },
	{ cls: 'bg-muted', name: 'muted' },
	{ cls: 'bg-accent', name: 'accent', note: '= brand-light' },
	{ cls: 'bg-destructive', name: 'destructive' },
	{ cls: 'bg-success', name: 'success' },
	{ cls: 'bg-border', name: 'border' },
	{ cls: 'bg-ring', name: 'ring', note: '= brand-strong' },
	{ cls: 'bg-foreground', name: 'foreground' },
	{ cls: 'bg-muted-foreground', name: 'muted-foreground' },
]

// Classes literais: o scanner do Tailwind v4 não resolve interpolação.
const CHARTS = [
	{ cls: 'bg-chart-1', name: 'chart-1' },
	{ cls: 'bg-chart-2', name: 'chart-2' },
	{ cls: 'bg-chart-3', name: 'chart-3' },
	{ cls: 'bg-chart-4', name: 'chart-4' },
	{ cls: 'bg-chart-5', name: 'chart-5' },
]

const TYPE = [
	{ cls: 'text-display', name: 'text-display', sample: 'Painel Estratégico' },
	{ cls: 'text-h1', name: 'text-h1', sample: 'Ciclos de Melhoria' },
	{ cls: 'text-h2', name: 'text-h2', sample: 'Plano de Ação 2026' },
	{ cls: 'text-kpi tabular-nums', name: 'text-kpi', sample: '87,4%' },
	{
		cls: 'text-body',
		name: 'text-body',
		sample: 'Corpo de texto padrão da aplicação, 14px.',
	},
	{
		cls: 'text-body font-medium',
		name: 'text-body + font-medium',
		sample: 'Rótulo de campo e valor de tabela.',
	},
	{
		cls: 'text-caption text-muted-foreground',
		name: 'text-caption',
		sample: 'Atualizado há 3 minutos',
	},
	{
		cls: 'text-overline text-muted-foreground uppercase',
		name: 'text-overline',
		sample: 'Indicadores de auditoria',
	},
]

const RADII = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl']
const SHADOWS = ['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg']
const SPACING = [
	{ token: '1', px: 4, cls: 'w-1' },
	{ token: '2', px: 8, cls: 'w-2' },
	{ token: '3', px: 12, cls: 'w-3' },
	{ token: '4', px: 16, cls: 'w-4' },
	{ token: '5', px: 20, cls: 'w-5' },
	{ token: '6', px: 24, cls: 'w-6' },
	{ token: '8', px: 32, cls: 'w-8' },
	{ token: '12', px: 48, cls: 'w-12' },
]

export function TokensSection() {
	return (
		<Section
			id='tokens'
			title='Tokens'
			description='Declarados em src/index.css via @theme inline. Nenhuma cor arbitrária em JSX.'
		>
			<Block title='Marca' hint='Azul dividido em papéis por contraste: fill, borda/anel e texto.'>
				<div className='grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6'>
					{BRAND.map((c) => (
						<Swatch
							key={c.name}
							className={c.cls}
							name={c.name}
							note={c.note}
						/>
					))}
				</div>
			</Block>

			<Block
				title='Semânticos (shadcn)'
				hint='Todo componente ui/ consome estes — a marca chega por remapeamento.'
			>
				<div className='grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6'>
					{SEMANTIC.map((c) => (
						<Swatch
							key={c.name}
							className={c.cls}
							name={c.name}
							note={c.note}
						/>
					))}
				</div>
			</Block>

			<Block title='Gráficos' hint='chart-1..5 — sempre com legenda rotulada.'>
				<div className='grid grid-cols-2 gap-4 md:grid-cols-5'>
					{CHARTS.map((c) => (
						<Swatch key={c.name} className={c.cls} name={c.name} />
					))}
				</div>
			</Block>

			<Block title='Tipografia'>
				<div className='space-y-4'>
					{TYPE.map((t) => (
						<div key={t.name} className='space-y-1'>
							<Label>{t.name}</Label>
							<p className={t.cls}>{t.sample}</p>
						</div>
					))}
				</div>
			</Block>

			<div className='grid gap-4 lg:grid-cols-3'>
				<Block title='Raio' hint='--radius: 0.5rem'>
					<Row>
						{RADII.map((r) => (
							<div key={r} className='space-y-1.5 text-center'>
								<div
									className={`size-16 border border-border bg-brand-light ${r}`}
								/>
								<p className='text-caption text-muted-foreground'>{r}</p>
							</div>
						))}
					</Row>
				</Block>

				<Block title='Elevação' hint='Borda física + sombra ótica.'>
					<Row>
						{SHADOWS.map((s) => (
							<div key={s} className='space-y-1.5 text-center'>
								<div
									className={`size-16 rounded-xl border border-border bg-card ${s}`}
								/>
								<p className='text-caption text-muted-foreground'>{s}</p>
							</div>
						))}
					</Row>
				</Block>

				<Block title='Espaçamento' hint='Grid 4px nativo do Tailwind v4.'>
					<div className='space-y-2'>
						{SPACING.map((s) => (
							<div key={s.token} className='flex items-center gap-3'>
								<span className='text-caption w-10 text-muted-foreground tabular-nums'>
									{s.token}
								</span>
								<div className={`h-3 rounded-sm bg-brand-strong ${s.cls}`} />
								<span className='text-caption text-muted-foreground tabular-nums'>
									{s.px}px
								</span>
							</div>
						))}
					</div>
				</Block>
			</div>
		</Section>
	)
}
