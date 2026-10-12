import { cva } from 'class-variance-authority'

import { cn } from 'src/lib/utils'

const badgeVariants = cva(
	'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3 [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default:
					'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
				secondary:
					'border-border bg-muted text-muted-foreground hover:bg-muted/80',
				destructive:
					'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
				success:
					'border-transparent bg-success text-success-foreground hover:bg-success/90',
				brand: 'border-brand-strong/25 bg-brand-light text-brand-text',
				outline: 'text-foreground',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
)

function Badge({ className, variant, ...props }) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	)
}

export { Badge, badgeVariants }
