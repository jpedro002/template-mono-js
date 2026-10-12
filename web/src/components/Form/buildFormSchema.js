// @ts-nocheck
// ============================================================
// Schema Zod builder — Extraído do Form para reutilização
// Gera automaticamente o schema de validação a partir dos fields
//
// zod v4: usa { error } (required_error/invalid_type_error foram
// removidos da API). Mensagens custom voltam a funcionar.
// ============================================================

import { z } from 'zod'

// ============================================================
// Helpers de moeda / data (compartilhados com os fields e prefill)
// ============================================================

/** "R$ 1.234,56" | 1234.56 | "1234.56" -> 1234.56 (reais, number) */
export function parseCurrencyToNumber(input) {
	if (input === null || input === undefined || input === '') return 0
	if (typeof input === 'number') return input
	const digits = String(input).replace(/\D/g, '')
	if (!digits) return 0
	return parseInt(digits, 10) / 100
}

/** 1234.56 -> "R$ 1.234,56" (para prefill do CurrencyField) */
export function formatCurrencyFromNumber(value) {
	const n = typeof value === 'number' ? value : parseCurrencyToNumber(value)
	return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** ISO "2024-01-01T10:00:00Z" -> "2024-01-01 10:00" (formato do DateTimeField) */
export function isoToDateTimeLocal(iso) {
	if (!iso || typeof iso !== 'string') return iso
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso
	const pad = (x) => String(x).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Constrói o schema Zod para um campo individual
 */
export function buildSubFieldSchema(subField) {
	switch (subField.type) {
		case 'picker':
			if (subField.required) {
				return z
					.union([z.string(), z.number(), z.null()])
					.refine((val) => val !== null && val !== undefined && val !== '', {
						error: subField.requiredMessage || 'Por favor, selecione uma opção',
					})
			}
			return z
				.union([z.string(), z.number(), z.null(), z.undefined()])
				.optional()

		case 'searchPicker':
			if (subField.multiSelect) {
				if (subField.required) {
					return z
						.array(z.union([z.string(), z.number()]))
						.min(
							1,
							subField.requiredMessage ||
								'Por favor, selecione pelo menos uma opção',
						)
				}
				return z.array(z.union([z.string(), z.number()])).optional()
			}
			if (subField.required) {
				return z
					.union([z.string(), z.number(), z.null()])
					.refine((val) => val !== null && val !== undefined && val !== '', {
						error: subField.requiredMessage || 'Por favor, selecione uma opção',
					})
			}
			return z
				.union([z.string(), z.number(), z.null(), z.undefined()])
				.optional()

		case 'number': {
			const base = z.union([z.string(), z.number(), z.null(), z.undefined()])
			const validated = subField.required
				? base.refine(
						(val) => val !== null && val !== undefined && val !== '',
						{
							error: subField.requiredMessage || 'Campo obrigatório',
						},
					)
				: base.optional()
			// Coerção: form guarda string do input; backend recebe number|null
			return validated.transform((val) =>
				val === '' || val === null || val === undefined ? null : Number(val),
			)
		}

		case 'boolean':
		case 'switch':
		case 'checkbox':
			// Switch mapeado p/ valores do banco (ex: 'ativo'/'inativo'):
			// o valor guardado não é booleano, então o schema aceita string/number.
			if ('trueValue' in subField || 'falseValue' in subField) {
				const mapped = z.union([z.string(), z.number(), z.boolean()])
				return subField.required ? mapped : mapped.optional()
			}
			if (subField.required) {
				if (subField.mustBeTrue) {
					return z.boolean().refine((val) => val === true, {
						error:
							subField.mustBeTrueMessage || 'Este campo precisa ser confirmado',
					})
				}
				return z.boolean()
			}
			return z.boolean().optional()

		case 'radio':
			if (subField.required) {
				return z
					.union([z.string(), z.number(), z.null()])
					.refine((val) => val !== null && val !== undefined && val !== '', {
						error: subField.requiredMessage || 'Por favor, selecione uma opção',
					})
			}
			return z
				.union([z.string(), z.number(), z.null(), z.undefined()])
				.optional()

		case 'checkboxGroup':
			if (subField.required) {
				return z
					.array(z.union([z.string(), z.number()]))
					.min(
						1,
						subField.requiredMessage ||
							'Por favor, selecione pelo menos uma opção',
					)
			}
			return z.array(z.union([z.string(), z.number()])).optional()

		case 'currency': {
			const base = z.union([z.string(), z.number(), z.null(), z.undefined()])
			const validated = subField.required
				? base.refine(
						(val) =>
							val !== null &&
							val !== undefined &&
							val !== '' &&
							val !== 'R$ 0,00' &&
							parseCurrencyToNumber(val) > 0,
						{
							error: subField.requiredMessage || 'Por favor, informe um valor',
						},
					)
				: base.optional()
			// Coerção: form guarda string mascarada; backend recebe number|null
			return validated.transform((val) =>
				val === null || val === undefined || val === ''
					? null
					: parseCurrencyToNumber(val),
			)
		}

		case 'date': {
			let dateSchema = subField.required
				? z
						.string({
							error:
								subField.requiredMessage || 'Por favor, selecione uma data',
						})
						.min(1, subField.requiredMessage || 'Por favor, selecione uma data')
				: z.union([z.string(), z.null(), z.undefined()]).optional()

			if (subField.noFutureDate) {
				dateSchema = dateSchema.refine(
					(val) => {
						if (!val) return true
						try {
							const date = new Date(val)
							const now = new Date()
							const today = new Date(
								now.getFullYear(),
								now.getMonth(),
								now.getDate(),
							)
							const selectedDate = new Date(
								date.getFullYear(),
								date.getMonth(),
								date.getDate(),
							)
							return selectedDate <= today
						} catch {
							return true
						}
					},
					{ error: 'Não é permitido cadastrar datas no futuro' },
				)
			}
			return dateSchema
		}

		case 'datetime': {
			let dtSchema = subField.required
				? z
						.string({
							error:
								subField.requiredMessage || 'Por favor, selecione data e hora',
						})
						.min(
							1,
							subField.requiredMessage || 'Por favor, selecione data e hora',
						)
				: z.union([z.string(), z.null(), z.undefined()]).optional()

			if (subField.noFutureDate) {
				dtSchema = dtSchema.refine(
					(val) => {
						if (!val) return true
						try {
							const date = new Date(val)
							const now = new Date()
							return date <= now
						} catch {
							return true
						}
					},
					{ error: 'Não é permitido cadastrar datas e horas no futuro' },
				)
			}
			return dtSchema
		}

		case 'email': {
			let emailSchema = z
				.string({
					error: subField.requiredMessage || 'Por favor, informe seu e-mail',
				})
				.email('Por favor, informe um e-mail válido')

			if (subField.maxLength) {
				emailSchema = emailSchema.max(
					subField.maxLength,
					`O e-mail deve ter no máximo ${subField.maxLength} caracteres`,
				)
			}
			if (subField.required) {
				return emailSchema.min(
					1,
					subField.requiredMessage || 'Por favor, informe seu e-mail',
				)
			}
			return z
				.union([emailSchema, z.literal(''), z.null(), z.undefined()])
				.optional()
		}

		case 'password': {
			let passSchema = z.string({
				error: subField.requiredMessage || 'Por favor, informe sua senha',
			})
			if (subField.maxLength) {
				passSchema = passSchema.max(
					subField.maxLength,
					`A senha deve ter no máximo ${subField.maxLength} caracteres`,
				)
			}
			if (subField.required) {
				let s = passSchema.min(
					1,
					subField.requiredMessage || 'Por favor, informe sua senha',
				)
				if (subField.minLength && subField.minLength > 1) {
					s = s.min(
						subField.minLength,
						`A senha deve ter pelo menos ${subField.minLength} caracteres`,
					)
				}
				return s
			}
			return z
				.union([passSchema, z.literal(''), z.null(), z.undefined()])
				.optional()
		}

		case 'tel': {
			let telSchema = z.string({
				error: subField.requiredMessage || 'Por favor, informe seu telefone',
			})
			if (subField.maxLength) {
				telSchema = telSchema.max(
					subField.maxLength,
					`O telefone deve ter no máximo ${subField.maxLength} caracteres`,
				)
			}
			if (subField.required) {
				let s = telSchema.min(
					1,
					subField.requiredMessage || 'Por favor, informe seu telefone',
				)
				if (subField.minLength && subField.minLength > 1) {
					s = s.min(
						subField.minLength,
						`O telefone deve ter pelo menos ${subField.minLength} caracteres`,
					)
				}
				return s
			}
			return z
				.union([telSchema, z.literal(''), z.null(), z.undefined()])
				.optional()
		}

		// 'text' e qualquer tipo não mapeado caem aqui
		default: {
			let textSchema = z.string({
				error: subField.requiredMessage || 'Este campo é obrigatório',
			})
			if (subField.maxLength) {
				textSchema = textSchema.max(
					subField.maxLength,
					`Deve ter no máximo ${subField.maxLength} caracteres`,
				)
			}
			if (subField.required) {
				let s = textSchema.min(
					1,
					subField.requiredMessage || 'Este campo é obrigatório',
				)
				if (subField.minLength && subField.minLength > 1) {
					s = s.min(
						subField.minLength,
						`Deve ter pelo menos ${subField.minLength} caracteres`,
					)
				}
				return s
			}
			return z
				.union([textSchema, z.literal(''), z.null(), z.undefined()])
				.optional()
		}
	}
}

/**
 * Avalia uma condição `visibleIf`. ÚNICA fonte de verdade — usada tanto
 * pelo schema (conditional-required) quanto pelo FormField (renderização),
 * evitando divergência de operadores.
 */
export function evaluateVisibleIf(condition, data) {
	if (!condition) return true
	const { field, operator, value } = condition
	const fieldValue = data?.[field]
	switch (operator) {
		case 'equals':
			return String(fieldValue ?? '') === String(value ?? '')
		case 'notEquals':
			return String(fieldValue ?? '') !== String(value ?? '')
		case 'contains':
			return (
				Array.isArray(fieldValue) &&
				fieldValue.map(String).includes(String(value))
			)
		case 'notContains':
			return !(
				Array.isArray(fieldValue) &&
				fieldValue.map(String).includes(String(value))
			)
		case 'greaterThan':
			return Number(fieldValue || 0) > Number(value || 0)
		case 'lessThan':
			return Number(fieldValue || 0) < Number(value || 0)
		default:
			return true
	}
}

function isValueEmpty(field, value) {
	if (value === null || value === undefined || value === '') return true
	if (
		field.type === 'searchPicker' &&
		field.multiSelect &&
		Array.isArray(value)
	)
		return value.length === 0
	return false
}

function getDefaultRequiredMessage(type) {
	switch (type) {
		case 'searchPicker':
		case 'picker':
			return 'Por favor, selecione uma opção'
		case 'currency':
			return 'Por favor, informe um valor'
		default:
			return 'Este campo é obrigatório'
	}
}

/**
 * Constrói o schema Zod completo a partir de um array de fields.
 */
export function buildFormSchema(fields, existingSchema) {
	if (existingSchema) return existingSchema

	const shape = {}
	const conditionalRequired = []

	fields.forEach((field) => {
		// Campos sem name não participam do schema
		if (!('name' in field) || !field.name) return

		const hasVisibleIf = 'visibleIf' in field && field.visibleIf

		// Campos condicionais: schema permissivo + validação via superRefine
		if (hasVisibleIf) {
			shape[field.name] = z.any().optional()
			if (field.required) conditionalRequired.push(field)
			return
		}

		let fieldSchema

		switch (field.type) {
			case 'fieldArray':
				if ('fields' in field && field.fields && Array.isArray(field.fields)) {
					const itemShape = {}
					for (const subField of field.fields) {
						if ('name' in subField && subField.name) {
							itemShape[subField.name] = buildSubFieldSchema(subField)
						}
					}
					const itemSchema = z.object(itemShape).passthrough()
					const minRows = 'minRows' in field ? field.minRows : 0
					const maxRows = 'maxRows' in field ? field.maxRows : undefined
					if (field.required && minRows && minRows > 0) {
						fieldSchema = z
							.array(itemSchema)
							.min(minRows, `Mínimo de ${minRows} itens obrigatório`)
					} else if (maxRows) {
						fieldSchema = z
							.array(itemSchema)
							.max(maxRows, `Máximo de ${maxRows} itens`)
					} else {
						fieldSchema = z.array(itemSchema).optional()
					}
				} else {
					fieldSchema = z.array(z.any()).optional()
				}
				break

			case 'hidden':
				fieldSchema = z
					.union([
						z.string(),
						z.number(),
						z.boolean(),
						z.null(),
						z.undefined(),
						z.array(z.any()),
						z.object({}).passthrough(),
					])
					.optional()
				break

			case 'label':
			case 'button':
			case 'custom':
				// Esses tipos não geram schema
				return

			default:
				fieldSchema = buildSubFieldSchema(field)
				break
		}

		shape[field.name] = fieldSchema
	})

	const baseSchema = z.object(shape).passthrough()

	if (conditionalRequired.length === 0) return baseSchema

	return baseSchema.superRefine((data, ctx) => {
		for (const field of conditionalRequired) {
			if (!evaluateVisibleIf(field.visibleIf, data)) continue
			if (isValueEmpty(field, data[field.name])) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						field.requiredMessage || getDefaultRequiredMessage(field.type),
					path: [field.name],
				})
			}
		}
	})
}

/**
 * Calcula os valores padrão para inicialização do formulário.
 */
export function buildDefaultValues(fields, data) {
	return fields.reduce((acc, field) => {
		// Campos sem name não participam dos valores
		if (!('name' in field) || !field.name) return acc

		// Se temos data e o campo existe nela, usa o valor de data (normalizado)
		if (data && data[field.name] !== undefined) {
			const raw = data[field.name]

			if (
				field.type === 'date' &&
				typeof raw === 'string' &&
				raw.includes('T')
			) {
				// ISO -> "yyyy-MM-dd"
				acc[field.name] = raw.split('T')[0]
			} else if (
				field.type === 'datetime' &&
				typeof raw === 'string' &&
				raw.includes('T')
			) {
				// ISO -> "yyyy-MM-dd HH:mm" (formato que o DateTimeField parseia)
				acc[field.name] = isoToDateTimeLocal(raw)
			} else if (field.type === 'currency' && typeof raw === 'number') {
				// number -> "R$ x,yy" (formato que o CurrencyField exibe)
				acc[field.name] = formatCurrencyFromNumber(raw)
			} else if (
				raw === null &&
				['text', 'email', 'password', 'tel', undefined].includes(field.type)
			) {
				// input controlado não aceita null
				acc[field.name] = ''
			} else {
				acc[field.name] = raw
			}
		} else {
			// Valores padrão baseados no tipo
			switch (field.type) {
				case 'boolean':
				case 'switch':
				case 'checkbox':
					acc[field.name] =
						'mustBeTrue' in field && field.mustBeTrue
							? false
							: 'defaultValue' in field && field.defaultValue !== undefined
								? field.defaultValue
								: 'falseValue' in field
									? field.falseValue
									: false
					break
				case 'number':
				case 'currency':
					acc[field.name] =
						'defaultValue' in field && field.defaultValue !== undefined
							? field.defaultValue
							: null
					break
				case 'picker':
				case 'radio':
					acc[field.name] =
						'defaultValue' in field && field.defaultValue !== undefined
							? field.defaultValue
							: null
					break
				case 'checkboxGroup':
				case 'searchPicker':
					acc[field.name] =
						'multiSelect' in field && field.multiSelect
							? 'defaultValue' in field && field.defaultValue !== undefined
								? field.defaultValue
								: []
							: 'defaultValue' in field && field.defaultValue !== undefined
								? field.defaultValue
								: field.type === 'checkboxGroup'
									? []
									: null
					break
				case 'hidden':
					acc[field.name] =
						'defaultValue' in field && field.defaultValue !== undefined
							? field.defaultValue
							: undefined
					break
				case 'label':
				case 'button':
				case 'custom':
					// Esses tipos não geram valores
					break
				default:
					acc[field.name] =
						'defaultValue' in field && field.defaultValue !== undefined
							? field.defaultValue
							: ''
			}
		}
		return acc
	}, {})
}
