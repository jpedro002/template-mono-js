import * as React from 'react'

import { cn } from 'src/lib/utils'

function Textarea({ className, ...props }) {
	return (
		<textarea
			data-slot='textarea'
			className={cn(
				'border-input placeholder:text-muted-foreground focus-visible:border-brand-strong focus-visible:ring-brand-strong/20 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 bg-card flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-body transition-[color,box-shadow,border-color] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
				className,
			)}
			{...props}
		/>
	)
}

export { Textarea }
