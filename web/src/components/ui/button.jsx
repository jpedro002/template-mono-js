import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from 'src/lib/utils'

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-body font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default:
					'bg-brand text-white shadow-xs hover:bg-brand-hover active:bg-brand-active',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
				success:
					'bg-success text-success-foreground shadow-xs hover:bg-success/90',
				outline:
					'border bg-card shadow-xs hover:bg-background hover:border-neutral dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
				secondary:
					'bg-secondary text-secondary-foreground border border-border hover:bg-background hover:border-neutral',
				brand: 'bg-brand-light text-brand-text border border-brand-strong/30 shadow-xs hover:bg-brand-light/70',
				ghost:
					'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
				link: 'text-brand-text underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-control px-4 py-2 has-[>svg]:px-3',
				sm: 'h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
				lg: 'h-11 rounded-lg px-6 has-[>svg]:px-4',
				icon: 'size-control',
				'icon-sm': 'size-9',
				'icon-lg': 'size-11',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

function Button({
	className,
	variant = 'default',
	size = 'default',
	asChild = false,
	...props
}) {
	const Comp = asChild ? Slot : 'button'

	return (
		<Comp
			data-slot='button'
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Button, buttonVariants }
