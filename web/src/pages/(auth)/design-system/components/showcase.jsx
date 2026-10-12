import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from 'src/components/ui/card'

export function Section({ id, title, description, children }) {
	return (
		<section id={id} className='scroll-mt-24 space-y-4'>
			<div>
				<h2 className='text-h1 text-foreground'>{title}</h2>
				{description && (
					<p className='text-body text-muted-foreground'>{description}</p>
				)}
			</div>
			{children}
		</section>
	)
}

export function Block({ title, hint, children, className = '' }) {
	return (
		<Card className='gap-0'>
			<CardHeader className='pb-4'>
				<CardTitle className='text-h2'>{title}</CardTitle>
				{hint && <p className='text-caption text-muted-foreground'>{hint}</p>}
			</CardHeader>
			<CardContent className={`space-y-4 ${className}`}>{children}</CardContent>
		</Card>
	)
}

export function Row({ children, className = '' }) {
	return (
		<div className={`flex flex-wrap items-center gap-3 ${className}`}>
			{children}
		</div>
	)
}

export function Label({ children }) {
	return (
		<span className='text-overline text-muted-foreground uppercase'>
			{children}
		</span>
	)
}

export function Swatch({ className, name, note }) {
	return (
		<div className='space-y-1.5'>
			<div
				className={`h-16 w-full rounded-lg border border-border ${className}`}
			/>
			<div>
				<p className='text-caption text-foreground'>{name}</p>
				{note && <p className='text-caption text-muted-foreground'>{note}</p>}
			</div>
		</div>
	)
}
