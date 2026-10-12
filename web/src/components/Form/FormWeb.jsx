// ============================================================
// FormWeb — Componente de formulário dinâmico (Web com shadcn/ui)
//
// Melhorias vs versão original:
//   1. Schema builder extraído para buildFormSchema.ts (compartilhável)
//   2. Tipagem forte com FieldDef discriminated union (types.ts)
//   3. FormField extraído e memoizado (FormField.tsx)
//   4. getValues() em vez de watch() no sync useEffect (fix loop)
//   5. console.log condicional (import.meta.env.DEV)
//   6. validationMode como prop
//   7. Scroll automático para primeiro erro
//   8. Animações nos erros
//   9. defaultValue para todos os tipos
//  10. aria-invalid / aria-describedby para acessibilidade
// ============================================================

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import React, {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from 'react'
import { useForm } from 'react-hook-form'
import { Button } from 'src/components/ui/button'
import { Card, CardContent } from 'src/components/ui/card'
import { buildDefaultValues, buildFormSchema } from './buildFormSchema'
import FormField from './FormFieldsWeb/FormField'

const Form = React.forwardRef(
	(
		{
			fields = [],
			schema,
			data = null,
			showRequiredIndicator = true,
			onSubmit = () => {},
			onChange = () => {},
			isLoading = false,
			submitLabel = 'Salvar',
			showSubmitButton = true,
			validationMode = 'onSubmit',
		},
		ref,
	) => {
		const formContainerRef = useRef(null)

		// ===== Schema (delegado ao builder extraído) =====
		const effectiveSchema = useMemo(
			() => buildFormSchema(fields, schema),
			[fields, schema],
		)

		// ===== Default values (delegado ao builder extraído) =====
		const defaultValues = useMemo(
			() => buildDefaultValues(fields, data),
			[fields, data],
		)

		// ===== React Hook Form =====
		const {
			control,
			handleSubmit,
			formState: { errors },
			reset,
			setValue,
			watch,
			getValues,
		} = useForm({
			resolver: zodResolver(effectiveSchema),
			defaultValues,
			mode: validationMode,
		})

		// ===== Ref imperativa =====
		useImperativeHandle(
			ref,
			() => ({
				reset: (values) => reset(values || defaultValues),
				setValue,
				watch,
				getValues: () => getValues(),
			}),
			[reset, setValue, watch, getValues, defaultValues],
		)

		// ===== Sync data prop → form state =====
		const dataStringRef = useRef(JSON.stringify(data))

		useEffect(() => {
			const currentDataString = JSON.stringify(data)
			if (
				currentDataString !== dataStringRef.current &&
				data !== null &&
				data !== undefined
			) {
				const isEmptyObject = Object.keys(data).length === 0

				if (isEmptyObject) {
					reset(defaultValues)
				} else {
					// Usando getValues() em vez de watch() para evitar re-render loop
					const currentValues = getValues()

					const fieldMap = {}
					fields.forEach((field) => {
						if ('name' in field && field.name) {
							fieldMap[field.name] = field
						}
					})

					Object.keys(data).forEach((key) => {
						if (!fieldMap[key]) return

						const field = fieldMap[key]
						let newValue = data[key]

						if (
							field.type === 'searchPicker' &&
							!('multiSelect' in field && field.multiSelect) &&
							newValue
						) {
							newValue = String(newValue)
						}

						if (currentValues[key] !== newValue) {
							setValue(key, newValue)
						}
					})
				}

				dataStringRef.current = currentDataString
			}
		}, [data, setValue, getValues, reset, defaultValues, fields])

		// ===== onChange global =====
		// Mantém o callback mais recente em ref → assina o watch UMA vez,
		// sem re-subscrever a cada render quando onChange é inline/sem memo.
		const onChangeRef = useRef(onChange)
		useEffect(() => {
			onChangeRef.current = onChange
		}, [onChange])

		useEffect(() => {
			const subscription = watch((value) => {
				onChangeRef.current?.(value)
			})
			return () => subscription.unsubscribe?.()
		}, [watch])

		// ===== Scroll para primeiro erro =====
		const scrollToFirstError = useCallback(() => {
			if (!formContainerRef.current) return

			// Pequeno delay para o DOM atualizar com os erros
			requestAnimationFrame(() => {
				const firstErrorEl =
					formContainerRef.current?.querySelector('[aria-invalid="true"]') ||
					formContainerRef.current?.querySelector('[data-error="true"]')
				if (firstErrorEl) {
					firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
				}
			})
		}, [])

		// ===== Empty state =====
		if (fields.length === 0) {
			return (
				<div className='flex flex-col items-center justify-center py-8'>
					<div className='mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted'>
						<span className='text-lg text-muted-foreground'>📋</span>
					</div>
					<p className='text-center text-muted-foreground'>
						Nenhum campo para preenchimento
					</p>
				</div>
			)
		}

		return (
			<form
				ref={formContainerRef}
				onSubmit={handleSubmit(
					(formData) => {
						if (import.meta.env.DEV) {
							console.log('[Form] handleSubmit SUCCESS - data:', formData)
						}
						onSubmit(formData)
					},
					(validationErrors) => {
						if (import.meta.env.DEV) {
							console.log(
								'[Form] handleSubmit ERROR - errors:',
								validationErrors,
							)
							console.log(
								'[Form] handleSubmit ERROR - formValues:',
								getValues(),
							)
						}
						scrollToFirstError()
					},
				)}
				className='grid grid-cols-12 gap-x-4 gap-y-5'
				noValidate
			>
				{showRequiredIndicator && (
					<p className='col-span-12 text-xs text-muted-foreground'>
						Campos obrigatórios são marcados com{' '}
						<span className='text-destructive'>*</span>
					</p>
				)}

				{/* Campos renderizados por componente memoizado */}
				{fields.map((field, index) => (
					<FormField
						key={'name' in field && field.name ? field.name : `field-${index}`}
						field={field}
						index={index}
						control={control}
						errors={errors}
						setValue={setValue}
						watch={watch}
						defaultValues={defaultValues}
					/>
				))}

				{/* Resumo de erros com animação */}
				{Object.keys(errors).length > 0 && (
					<Card
						className='col-span-12 animate-in fade-in slide-in-from-top-2 border-destructive/30 bg-destructive/5 duration-300'
						data-error='true'
					>
						<CardContent className='p-4'>
							<div className='mb-2 flex items-center gap-2'>
								<AlertTriangle className='h-5 w-5 text-destructive' />
								<span className='font-bold text-destructive'>Atenção</span>
							</div>
							<p className='mb-2 text-sm text-destructive'>
								Por favor, corrija os seguintes erros antes de continuar:
							</p>
							<ul className='space-y-1' role='alert' aria-live='polite'>
								{Object.entries(errors).map(([fieldName, error]) => {
									const matchedField = fields.find(
										(f) => 'name' in f && f.name === fieldName,
									)
									const fieldLabel =
										matchedField && 'label' in matchedField
											? matchedField.label
											: fieldName

									let errorText = ''
									if (typeof error === 'string') {
										errorText = error
									} else if (
										error?.message &&
										typeof error.message === 'string'
									) {
										errorText = error.message
									} else if (typeof error === 'object' && error !== null) {
										return null
									}

									if (!errorText) return null

									return (
										<li
											key={fieldName}
											className='animate-in fade-in slide-in-from-left-1 flex items-start gap-2 duration-200'
										>
											<span className='text-destructive'>•</span>
											<span className='flex-1 text-sm text-destructive'>
												<span className='font-semibold'>{fieldLabel}:</span>{' '}
												{errorText}
											</span>
										</li>
									)
								})}
							</ul>
						</CardContent>
					</Card>
				)}

				{/* Submit Button */}
				{showSubmitButton && (
					<div className='col-span-12 pt-2'>
						<Button
							type='submit'
							disabled={isLoading}
							className='w-full'
							size='lg'
						>
							{isLoading ? (
								<>
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
									Salvando...
								</>
							) : (
								submitLabel
							)}
						</Button>
					</div>
				)}
			</form>
		)
	},
)

Form.displayName = 'Form'

export default Form
