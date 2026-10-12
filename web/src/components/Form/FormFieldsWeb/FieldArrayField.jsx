import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import React, { useMemo } from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import { Badge } from 'src/components/ui/badge'
import { Button } from 'src/components/ui/button'
import { Card, CardContent, CardHeader } from 'src/components/ui/card'
import { Label } from 'src/components/ui/label'
import { cn } from 'src/lib/utils'
import BooleanField from './BooleanField'
import CurrencyField from './CurrencyField'
import DateTimeField from './DateTimeField'
import PickerField from './PickerField'
import SearchPickerField from './SearchPickerField'
import TextField from './TextField'

/**
 * FieldArrayField - Componente para gerenciar arrays dinâmicos de campos (migrado de RN)
 */

const FieldArrayField = ({
	name,
	control,
	fields,
	label,
	minRows = 0,
	maxRows = undefined,
	addButtonLabel = 'Adicionar',
	removeButtonLabel = 'Remover',
	errors = {},
	required = false,
}) => {
	const {
		fields: arrayFields,
		append,
		remove,
	} = useFieldArray({
		control: control,
		name,
	})

	const canAdd = useMemo(() => {
		if (maxRows === undefined) return true
		return arrayFields.length < maxRows
	}, [arrayFields.length, maxRows])

	const canRemoveIndex = () => arrayFields.length > minRows

	const createDefaultItem = useMemo(() => {
		const defaultItem = {}
		for (const field of fields) {
			switch (field.type) {
				case 'boolean':
					defaultItem[field.name] = false
					break
				case 'number':
				case 'currency':
					defaultItem[field.name] = null
					break
				case 'picker':
				case 'searchPicker':
					defaultItem[field.name] = field.multiSelect ? [] : null
					break
				default:
					defaultItem[field.name] = ''
			}
		}
		return defaultItem
	}, [fields])

	const renderArrayField = (field, itemIndex) => {
		const { name: fieldName, type, label: fieldLabel, ...fieldProps } = field
		const fullFieldName = `${name}.${itemIndex}.${fieldName}`

		const fieldError = errors?.[name]?.[itemIndex]?.[fieldName]

		let errorMessage = null
		if (fieldError) {
			if (typeof fieldError === 'string') {
				errorMessage = fieldError
			} else if (
				fieldError?.message &&
				typeof fieldError.message === 'string'
			) {
				errorMessage = fieldError.message
			}
		}

		return (
			<Controller
				control={control}
				name={fullFieldName}
				key={fullFieldName}
				render={({ field: { onChange, value } }) => {
					if (
						typeof value === 'object' &&
						value !== null &&
						!Array.isArray(value)
					) {
						return (
							<div className='rounded-lg border border-destructive bg-destructive/5 p-3'>
								<p className='font-bold text-destructive'>Erro de Dados</p>
								<p className='mt-1 text-xs text-destructive'>
									Campo {fieldName} recebeu dados inválidos. Por favor,
									recarregue.
								</p>
							</div>
						)
					}

					const handleChange = (newValue) => {
						onChange(newValue)
						if (fieldProps.onChange) {
							fieldProps.onChange(newValue)
						}
					}

					switch (type) {
						case 'text':
						case 'email':
						case 'password':
						case 'tel':
						case 'number':
							return (
								<TextField
									className={fieldProps.inputClassName}
									value={value}
									onChangeText={handleChange}
									placeholder={fieldProps.placeholder || `${fieldLabel}...`}
									error={errorMessage}
									inputType={type}
									fieldName={fieldName}
									maxLength={fieldProps.maxLength}
									editable={fieldProps.editable !== false}
									multiline={fieldProps.multiline}
									minHeight={fieldProps.minHeight}
								/>
							)

						case 'currency':
							return (
								<CurrencyField
									className={fieldProps.inputClassName}
									value={value}
									onChange={handleChange}
									error={errorMessage}
									editable={fieldProps.editable !== false}
								/>
							)

						case 'date':
							return (
								<DateTimeField
									className={fieldProps.inputClassName}
									value={value}
									onChange={handleChange}
									error={errorMessage}
									mode='date'
									editable={fieldProps.editable !== false}
								/>
							)

						case 'datetime':
							return (
								<DateTimeField
									className={fieldProps.inputClassName}
									value={value}
									onChange={handleChange}
									error={errorMessage}
									mode='datetime'
									editable={fieldProps.editable !== false}
								/>
							)

						case 'boolean':
							return (
								<BooleanField
									className={fieldProps.inputClassName}
									value={value}
									onChange={handleChange}
									error={errorMessage}
									editable={fieldProps.editable !== false}
									opcoes={fieldProps.opcoes}
								/>
							)

						case 'picker':
							return (
								<PickerField
									className={fieldProps.inputClassName}
									value={value}
									onChange={handleChange}
									error={errorMessage}
									editable={fieldProps.editable !== false}
									options={fieldProps.options}
								/>
							)

						case 'searchPicker':
							return (
								<SearchPickerField
									className={fieldProps.inputClassName}
									value={value}
									onChange={handleChange}
									error={errorMessage}
									label={fieldLabel}
									editable={fieldProps.editable !== false}
									options={fieldProps.options}
									searchable={fieldProps.searchable}
									searchPlaceholder={fieldProps.searchPlaceholder}
									placeholder={fieldProps.placeholder}
									multiSelect={fieldProps.multiSelect}
									onSearchChange={fieldProps.onSearchChange}
									emptyMessage={fieldProps.emptyMessage}
								/>
							)

						default:
							return (
								<p className='text-sm text-destructive'>
									Tipo desconhecido: {type}
								</p>
							)
					}
				}}
			/>
		)
	}

	return (
		<div className='space-y-3'>
			{/* Header */}
			<div className='space-y-1'>
				<Label className='text-base font-bold'>
					{typeof label === 'string' ? label : `[Invalid label]`}
					{required && <span className='text-destructive'> *</span>}
				</Label>
				<p className='text-xs text-muted-foreground'>
					{arrayFields.length} {arrayFields.length === 1 ? 'item' : 'itens'}
					{maxRows && ` de ${maxRows}`}
				</p>
			</div>

			{/* Items */}
			<div className='space-y-4'>
				{arrayFields.length === 0 ? (
					<div className='flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-6'>
						<p className='text-center text-sm text-muted-foreground'>
							Nenhum item adicionado. Clique em &ldquo;{addButtonLabel}&rdquo;
							para começar.
						</p>
					</div>
				) : (
					arrayFields.map((item, index) => (
						<Card key={item.id} className='overflow-hidden'>
							<CardHeader className='flex flex-row items-center justify-between border-b bg-muted/30 px-4 py-3'>
								<Badge variant='outline' className='font-semibold'>
									Item {index + 1}
								</Badge>
								{canRemoveIndex() && (
									<Button
										type='button'
										variant='ghost'
										size='sm'
										onClick={() => remove(index)}
										className='h-7 text-destructive hover:bg-destructive/10 hover:text-destructive'
									>
										<Trash2 className='mr-1 h-3.5 w-3.5' />
										{removeButtonLabel}
									</Button>
								)}
							</CardHeader>
							<CardContent className='space-y-4 p-4'>
								{fields.map((field) => (
									<div
										key={`${name}-${index}-${field.name}`}
										className={cn('space-y-1.5', field.className)}
									>
										<Label
											className={cn(
												'text-sm font-semibold',
												field.labelClassName,
											)}
										>
											{typeof field.label === 'string'
												? field.label
												: `[Invalid]`}
											{field.required && (
												<span className='text-destructive'> *</span>
											)}
										</Label>
										{renderArrayField(field, index)}
									</div>
								))}
							</CardContent>
						</Card>
					))
				)}
			</div>

			{/* Add Button */}
			{canAdd && (
				<Button
					type='button'
					variant='outline'
					onClick={() => append(createDefaultItem)}
					className='w-full border-primary/30 text-primary hover:bg-primary/5'
				>
					<Plus className='mr-2 h-4 w-4' />
					{addButtonLabel}
				</Button>
			)}

			{/* Limit reached */}
			{!canAdd && maxRows && (
				<div className='flex items-center justify-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950'>
					<AlertTriangle className='h-4 w-4 text-yellow-600' />
					<p className='text-sm font-semibold text-yellow-700 dark:text-yellow-400'>
						Limite de {maxRows} itens atingido
					</p>
				</div>
			)}

			{/* Minimum not met */}
			{arrayFields.length < minRows && (
				<div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3'>
					<p className='text-xs text-destructive'>
						⚠️ Mínimo de {minRows} {minRows === 1 ? 'item' : 'itens'} obrigatório
						({arrayFields.length} de {minRows})
					</p>
				</div>
			)}
		</div>
	)
}

export default FieldArrayField
