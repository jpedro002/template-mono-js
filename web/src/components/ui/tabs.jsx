import * as React from 'react'

import { cn } from 'src/lib/utils'

const TabsContext = React.createContext(null)

function Tabs({ defaultValue, value, onValueChange, className, ...props }) {
	const [interno, setInterno] = React.useState(defaultValue)
	const atual = value ?? interno

	const trocar = React.useCallback(
		(proximo) => {
			setInterno(proximo)
			onValueChange?.(proximo)
		},
		[onValueChange],
	)

	return (
		<TabsContext.Provider value={{ valor: atual, trocar }}>
			<div
				data-slot='tabs'
				className={cn('flex flex-col gap-2', className)}
				{...props}
			/>
		</TabsContext.Provider>
	)
}

function TabsList({ className, ...props }) {
	return (
		<div
			data-slot='tabs-list'
			role='tablist'
			className={cn(
				'inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
				className,
			)}
			{...props}
		/>
	)
}

function TabsTrigger({ value, className, ...props }) {
	const { valor, trocar } = React.useContext(TabsContext)
	const ativo = valor === value

	return (
		<button
			type='button'
			role='tab'
			aria-selected={ativo}
			data-state={ativo ? 'active' : 'inactive'}
			onClick={() => trocar(value)}
			className={cn(
				'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-sm transition-all disabled:pointer-events-none disabled:opacity-50',
				ativo
					? 'bg-background text-foreground shadow-sm'
					: 'hover:text-foreground',
				className,
			)}
			{...props}
		/>
	)
}

function TabsContent({ value, className, ...props }) {
	const { valor } = React.useContext(TabsContext)
	if (valor !== value) return null

	return (
		<div
			data-slot='tabs-content'
			role='tabpanel'
			className={cn('flex-1 outline-none', className)}
			{...props}
		/>
	)
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
