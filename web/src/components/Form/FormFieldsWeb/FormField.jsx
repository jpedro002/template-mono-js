// ============================================================
// FormField — Componente memoizado que renderiza um campo
// Extraído do renderField do Form para permitir React.memo
// ============================================================

import React, { useCallback, useId } from 'react'
import { Controller, useWatch } from 'react-hook-form'
import { Button } from 'src/components/ui/button'
import { Checkbox } from 'src/components/ui/checkbox'
import { Label } from 'src/components/ui/label'
import { RadioGroup, RadioGroupItem } from 'src/components/ui/radio-group'
import { Separator } from 'src/components/ui/separator'
import { Switch } from 'src/components/ui/switch'
import { cn } from 'src/lib/utils'
import { evaluateVisibleIf } from '../buildFormSchema'
import {
	BooleanField,
	CurrencyField,
	DateTimeField,
	FieldArrayField,
	PickerField,
	SearchPickerField,
	TextField,
} from './index'

// Grid responsivo: cols 1-12 (default 12 = largura total)
const getGridClass = (cols) => {
	const map = {
		1: 'col-span-12 md:col-span-1',
		2: 'col-span-12 md:col-span-2',
		3: 'col-span-12 md:col-span-3',
		4: 'col-span-12 md:col-span-4',
		5: 'col-span-12 md:col-span-5',
		6: 'col-span-12 md:col-span-6',
		7: 'col-span-12 md:col-span-7',
		8: 'col-span-12 md:col-span-8',
		9: 'col-span-12 md:col-span-9',
		10: 'col-span-12 md:col-span-10',
		11: 'col-span-12 md:col-span-11',
		12: 'col-span-12',
	}
	return map[cols] || map[12]
}

const FormField = React.memo(
	({ field, index, control, errors, setValue, watch, defaultValues = {} }) => {
		const errorId = useId()
		const fieldId = useId()

		const name = 'name' in field ? field.name : ''
		const label = 'label' in field ? field.label : ''
		const required = 'required' in field ? field.required : false
		const description = 'description' in field ? field.description : undefined
		const customOnChange = 'onChange' in field ? field.onChange : undefined
		const safeLabel = typeof label === 'string' && label ? label : ''
		const cols = 'cols' in field ? field.cols : 12
		const gridClass = getGridClass(cols)

		// Três alvos distintos de estilo, porque cada campo é uma pilha
		// wrapper > label > controle e mexer em um não deve mexer nos outros:
		//   className      → wrapper da célula do grid
		//   labelClassName → o <Label> (ou o texto, no type 'label')
		//   inputClassName → o controle em si (input, trigger, grupo de opções)
		const className = 'className' in field ? field.className : ''
		const labelClassName = 'labelClassName' in field ? field.labelClassName : ''
		const inputClassName = 'inputClassName' in field ? field.inputClassName : ''

		const handleChange = useCallback(
			(rhfOnChange) => (newValue) => {
				rhfOnChange(newValue)
				if (customOnChange) {
					customOnChange(newValue, { setValue, watch })
				}
			},
			[customOnChange, setValue, watch],
		)

		// ==========================================
		// BUSCA DE OPÇÕES DINÂMICAS DE API (optionsSource)
		// ==========================================
		const [dynamicOptions, setDynamicOptions] = React.useState([])
		const [loadingOptions, setLoadingOptions] = React.useState(false)

		const optionsSource =
			'optionsSource' in field ? field.optionsSource : undefined
		const dependsOnValue = useWatch({
			control,
			name: optionsSource?.dependsOn || '_dummyDepends',
			defaultValue: '',
		})

		React.useEffect(() => {
			if (!optionsSource || !optionsSource.url) {
				setDynamicOptions([])
				return
			}

			// Se depende de outro campo e ele não tem valor, limpa as opções
			if (
				optionsSource.dependsOn &&
				(dependsOnValue === null ||
					dependsOnValue === undefined ||
					dependsOnValue === '')
			) {
				setDynamicOptions([])
				return
			}

			let active = true
			const fetchOptions = async () => {
				setLoadingOptions(true)
				try {
					let url = optionsSource.url
					if (
						optionsSource.dependsOn &&
						dependsOnValue !== null &&
						dependsOnValue !== undefined
					) {
						const param = optionsSource.queryParam || optionsSource.dependsOn
						const connector = url.includes('?') ? '&' : '?'
						url += `${connector}${param}=${encodeURIComponent(String(dependsOnValue))}`
					}

					const res = await fetch(url)
					if (!res.ok) throw new Error('Erro')
					const data = await res.json()

					let arrayData = []
					if (Array.isArray(data)) {
						arrayData = data
					} else if (data && typeof data === 'object') {
						const rKey = optionsSource.resultKey
						if (rKey) {
							// Suporta caminhos aninhados com ponto, ex: 'response.results' ou 'data.items'
							const parts = rKey.split('.')
							let current = data
							for (const part of parts) {
								if (current && typeof current === 'object' && part in current) {
									current = current[part]
								} else {
									current = undefined
									break
								}
							}
							if (Array.isArray(current)) {
								arrayData = current
							}
						}

						// Fallback se resultKey não retornar array ou se não foi especificada
						if (arrayData.length === 0) {
							if (Array.isArray(data.results)) {
								arrayData = data.results
							} else if (Array.isArray(data.data)) {
								arrayData = data.data
							} else if (Array.isArray(data.items)) {
								arrayData = data.items
							}
						}
					}

					if (active && arrayData.length > 0) {
						const formatted = arrayData.map((item) => ({
							label: String(
								item[optionsSource.labelKey || 'label'] || item.label || '',
							),
							value:
								item[optionsSource.valueKey || 'value'] ?? item.value ?? '',
						}))
						setDynamicOptions(formatted)
					}
				} catch (err) {
					console.error('[Form] Erro ao carregar opções dinâmicas:', err)
				} finally {
					if (active) setLoadingOptions(false)
				}
			}

			fetchOptions()

			return () => {
				active = false
			}
		}, [optionsSource?.url, optionsSource?.dependsOn, dependsOnValue])

		// ==========================================
		// AVALIAÇÃO DE VISIBILIDADE CONDICIONAL (visibleIf)
		// Usa a MESMA função do schema (buildFormSchema) p/ evitar divergência.
		// ==========================================
		const visibleIf = 'visibleIf' in field ? field.visibleIf : undefined

		const watchedValue = useWatch({
			control,
			name: visibleIf?.field || '_dummyVisible',
			defaultValue:
				visibleIf?.field !== undefined
					? (defaultValues[visibleIf.field] ?? '')
					: '',
		})

		const isVisible = React.useMemo(() => {
			if (!visibleIf) return true
			return evaluateVisibleIf(visibleIf, { [visibleIf.field]: watchedValue })
		}, [visibleIf, watchedValue])

		if (!isVisible) return null

		// Early returns para tipos que não precisam de Controller
		if ('hidden' in field && field.hidden) return null
		if (field.type === 'hidden') return null

		// Resolução de options (estáticas ou dinâmicas via API)
		const resolvedOptions = optionsSource
			? dynamicOptions
			: 'options' in field
				? field.options
				: []

		// Label / section separator
		if (field.type === 'label') {
			const labelKey = ('name' in field && field.name) || `label-${index}`
			return (
				<div key={labelKey} className={cn(gridClass, 'pt-4 pb-1', className)}>
					<Separator className='mb-3' />
					<p className={cn('text-h2 text-foreground', labelClassName)}>
						{field.label}
					</p>
				</div>
			)
		}

		// Custom render
		if (field.type === 'custom' && typeof field.render === 'function') {
			const customKey = ('name' in field && field.name) || `custom-${index}`
			return (
				<div key={customKey} className={cn(gridClass, 'space-y-2', className)}>
					{field.render({ control, errors, setValue, watch })}
				</div>
			)
		}

		// FieldArray
		if (field.type === 'fieldArray') {
			return (
				<div className={cn(gridClass, className)}>
					<FieldArrayField
						key={field.name}
						name={field.name}
						control={control}
						fields={field.fields || []}
						label={field.label}
						required={field.required}
						minRows={field.minRows || 0}
						maxRows={field.maxRows}
						addButtonLabel={field.addButtonLabel || 'Adicionar'}
						removeButtonLabel={field.removeButtonLabel || 'Remover'}
						errors={errors}
					/>
				</div>
			)
		}

		// Button type
		if (field.type === 'button') {
			const buttonKey = ('name' in field && field.name) || `button-${index}`
			return (
				<div key={buttonKey} className={cn(gridClass, 'space-y-2', className)}>
					<Button
						type='button'
						onClick={'onPress' in field ? field.onPress : undefined}
						disabled={'disabled' in field ? field.disabled : false}
						className={cn('w-full', inputClassName)}
						variant={
							'disabled' in field && field.disabled ? 'ghost' : 'default'
						}
					>
						{field.label}
					</Button>
					{'renderAfter' in field && field.renderAfter && field.renderAfter()}
				</div>
			)
		}

		// --- Campos com Controller ---
		if (!name || name.trim() === '') {
			if (import.meta.env.DEV) {
				console.warn(`[Form] Campo sem name válido encontrado:`, field)
			}
			return null
		}

		// Switch — layout inline com label à esquerda (toggle à direita)
		if (field.type === 'switch') {
			// trueValue/falseValue: o form guarda o valor que o banco espera
			// (ex: 'ativo'/'inativo') e o toggle só o representa visualmente.
			const hasValueMap = 'trueValue' in field || 'falseValue' in field
			const trueValue = 'trueValue' in field ? field.trueValue : true
			const falseValue = 'falseValue' in field ? field.falseValue : false
			const isOn = (v) => (hasValueMap ? String(v) === String(trueValue) : !!v)
			return (
				<div
					className={cn(
						gridClass,
						'flex flex-row items-center justify-between rounded-lg border p-4',
						className,
					)}
				>
					<div className='space-y-0.5'>
						<Label className={cn('text-base', labelClassName)}>{label}</Label>
						{description && (
							<p className='text-sm text-muted-foreground'>{description}</p>
						)}
					</div>
					<Controller
						control={control}
						name={name}
						render={({ field: { onChange: rhfOnChange, value } }) => (
							<Switch
								className={inputClassName || undefined}
								checked={isOn(value)}
								onCheckedChange={(checked) =>
									handleChange(rhfOnChange)(
										hasValueMap ? (checked ? trueValue : falseValue) : checked,
									)
								}
								disabled={
									'editable' in field ? field.editable === false : false
								}
							/>
						)}
					/>
				</div>
			)
		}

		// Checkbox único — caixa + label/descrição ao lado
		if (field.type === 'checkbox') {
			const errorMessage =
				errors[name]?.message ||
				(typeof errors[name] === 'string' ? errors[name] : null)
			return (
				<div
					className={cn(
						gridClass,
						'flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4',
						className,
					)}
				>
					<Controller
						control={control}
						name={name}
						render={({ field: { onChange: rhfOnChange, value } }) => (
							<Checkbox
								id={fieldId}
								className={inputClassName || undefined}
								checked={!!value}
								onCheckedChange={handleChange(rhfOnChange)}
								disabled={
									'editable' in field ? field.editable === false : false
								}
							/>
						)}
					/>
					<div className='space-y-1 leading-none'>
						<Label htmlFor={fieldId} className={labelClassName || undefined}>
							{label}
							{required && <span className='text-destructive'> *</span>}
						</Label>
						{description && (
							<p className='text-sm text-muted-foreground'>{description}</p>
						)}
						{errorMessage && (
							<p className='text-sm text-destructive'>{errorMessage}</p>
						)}
					</div>
				</div>
			)
		}

		return (
			<div className={cn(gridClass, 'space-y-2', className)} data-field={name}>
				<Label
					htmlFor={fieldId}
					className={cn(
						'text-body font-semibold text-foreground',
						labelClassName,
					)}
				>
					{label}
					{required && <span className='text-destructive'> *</span>}
				</Label>
				{description && (
					<p className='text-xs text-muted-foreground'>{description}</p>
				)}

				<Controller
					control={control}
					name={name}
					render={({ field: { onChange: rhfOnChange, value } }) => {
						const errorMessage =
							errors[name]?.message ||
							(typeof errors[name] === 'string' ? errors[name] : null)
						const hasError = !!errorMessage
						const onChangeWrapped = handleChange(rhfOnChange)

						switch (field.type) {
							case 'text':
							case 'email':
							case 'password':
							case 'tel':
							case 'number':
								return (
									<div
										role='group'
										aria-invalid={hasError}
										aria-describedby={hasError ? errorId : undefined}
									>
										<TextField
											className={inputClassName}
											value={value}
											onChangeText={onChangeWrapped}
											placeholder={
												'placeholder' in field && field.placeholder
													? field.placeholder
													: `Digite ${safeLabel.toLowerCase()}...`
											}
											error={errorMessage}
											inputType={field.type}
											fieldName={name}
											maxLength={
												'maxLength' in field ? field.maxLength : undefined
											}
											editable={
												'editable' in field ? field.editable !== false : true
											}
											mask={
												field.type === 'text' && 'mask' in field
													? field.mask
													: undefined
											}
											multiline={
												field.type === 'text' && 'multiline' in field
													? field.multiline
													: false
											}
											minHeight={
												field.type === 'text' && 'minHeight' in field
													? field.minHeight
													: 0
											}
										/>

										{hasError && (
											<p id={errorId} className='sr-only'>
												{errorMessage}
											</p>
										)}
									</div>
								)

							case 'currency':
								return (
									<div
										aria-invalid={hasError}
										aria-describedby={hasError ? errorId : undefined}
									>
										<CurrencyField
											className={inputClassName}
											value={value}
											onChange={onChangeWrapped}
											error={errorMessage}
											editable={
												'editable' in field ? field.editable !== false : true
											}
										/>
									</div>
								)

							case 'date':
								return (
									<DateTimeField
										className={inputClassName}
										value={value}
										onChange={onChangeWrapped}
										error={errorMessage}
										mode='date'
										editable={
											'editable' in field ? field.editable !== false : true
										}
										showCurrentButton={
											'showCurrentButton' in field
												? field.showCurrentButton !== false
												: true
										}
										noFutureDate={
											'noFutureDate' in field
												? field.noFutureDate === true
												: false
										}
									/>
								)

							case 'datetime':
								return (
									<DateTimeField
										className={inputClassName}
										value={value}
										onChange={onChangeWrapped}
										error={errorMessage}
										mode='datetime'
										editable={
											'editable' in field ? field.editable !== false : true
										}
										showCurrentButton={
											'showCurrentButton' in field
												? field.showCurrentButton !== false
												: true
										}
										noFutureDate={
											'noFutureDate' in field
												? field.noFutureDate === true
												: false
										}
									/>
								)

							case 'boolean':
								return (
									<BooleanField
										className={inputClassName}
										value={value}
										onChange={onChangeWrapped}
										error={errorMessage}
										editable={
											'editable' in field ? field.editable !== false : true
										}
										opcoes={'opcoes' in field ? field.opcoes : undefined}
									/>
								)

							case 'radio':
								return (
									<div
										aria-invalid={hasError}
										aria-describedby={hasError ? errorId : undefined}
									>
										<RadioGroup
											value={value != null ? String(value) : ''}
											onValueChange={onChangeWrapped}
											className={cn('flex flex-col space-y-1', inputClassName)}
											disabled={
												'editable' in field ? field.editable === false : false
											}
										>
											{resolvedOptions.map((opt) => (
												<div
													key={String(opt.value)}
													className='flex items-center space-x-2'
												>
													<RadioGroupItem
														value={String(opt.value)}
														id={`${fieldId}-${opt.value}`}
													/>
													<Label
														htmlFor={`${fieldId}-${opt.value}`}
														className='cursor-pointer font-normal'
													>
														{opt.label}
													</Label>
												</div>
											))}
										</RadioGroup>
										{hasError && (
											<p className='mt-1 text-sm text-destructive'>
												{errorMessage}
											</p>
										)}
									</div>
								)

							case 'checkboxGroup': {
								const arr = Array.isArray(value) ? value : []
								return (
									<div
										className={cn('grid gap-2', inputClassName)}
										aria-invalid={hasError}
										aria-describedby={hasError ? errorId : undefined}
									>
										{resolvedOptions.map((opt) => {
											const checked = arr
												.map(String)
												.includes(String(opt.value))
											return (
												<div
													key={String(opt.value)}
													className='flex items-center space-x-2'
												>
													<Checkbox
														id={`${fieldId}-${opt.value}`}
														checked={checked}
														onCheckedChange={(isChecked) => {
															const next = isChecked
																? [...arr, opt.value]
																: arr.filter(
																		(v) => String(v) !== String(opt.value),
																	)
															onChangeWrapped(next)
														}}
													/>
													<Label
														htmlFor={`${fieldId}-${opt.value}`}
														className='cursor-pointer font-normal'
													>
														{opt.label}
													</Label>
												</div>
											)
										})}
										{hasError && (
											<p className='mt-1 text-sm text-destructive'>
												{errorMessage}
											</p>
										)}
									</div>
								)
							}

							case 'picker':
								return (
									<PickerField
										className={inputClassName}
										value={value}
										onChange={onChangeWrapped}
										error={errorMessage}
										editable={
											'editable' in field ? field.editable !== false : true
										}
										options={resolvedOptions}
										placeholder={
											loadingOptions
												? 'Carregando...'
												: 'placeholder' in field
													? field.placeholder
													: undefined
										}
									/>
								)

							case 'searchPicker':
								return (
									<SearchPickerField
										className={inputClassName}
										value={value}
										onChange={onChangeWrapped}
										error={errorMessage}
										label={label}
										editable={
											'editable' in field ? field.editable !== false : true
										}
										options={resolvedOptions}
										searchable={'searchable' in field ? field.searchable : true}
										searchPlaceholder={
											'searchPlaceholder' in field
												? field.searchPlaceholder
												: undefined
										}
										placeholder={
											loadingOptions
												? 'Carregando...'
												: 'placeholder' in field
													? field.placeholder
													: undefined
										}
										multiSelect={
											'multiSelect' in field ? field.multiSelect : false
										}
										onSearchChange={
											'onSearchChange' in field ? field.onSearchChange : null
										}
										emptyMessage={
											'emptyMessage' in field ? field.emptyMessage : undefined
										}
									/>
								)

							default:
								return (
									<p className='text-body text-destructive'>
										Tipo de campo desconhecido: {field.type}
									</p>
								)
						}
					}}
				/>
			</div>
		)
	},
)

FormField.displayName = 'FormField'

export default FormField
