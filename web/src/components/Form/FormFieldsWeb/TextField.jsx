import { Lock } from 'lucide-react'
import React from 'react'
import { Input } from 'src/components/ui/input'
import { Textarea } from 'src/components/ui/textarea'

/**
 * Campo de texto reutilizável para formulários web (migrado de RN)
 *
 * @param {string} value - Valor do campo
 * @param {function} onChangeText - Callback chamado quando o texto muda
 * @param {string} placeholder - Texto placeholder
 * @param {string|object} error - Mensagem de erro ou objeto de erro
 * @param {boolean} multiline - Se deve permitir múltiplas linhas
 * @param {number} minHeight - Altura mínima (para campos multiline)
 * @param {string} className - Classes CSS adicionais
 * @param {string} fieldName - Nome do campo (usado para detecção automática de máscaras)
 * @param {number} maxLength - Tamanho máximo do texto
 * @param {string} inputType - Tipo do input (text, email, password, tel, number)
 * @param {boolean} editable - Se o campo é editável
 * @param {function} mask - Função de máscara customizada
 */

// Máscaras inline (substituindo os imports de RN)
const formatCPFCNPJ = (text) => {
	const numbers = text.replace(/\D/g, '')
	if (numbers.length <= 11) {
		// CPF: 000.000.000-00
		return numbers
			.replace(/(\d{3})(\d)/, '$1.$2')
			.replace(/(\d{3})(\d)/, '$1.$2')
			.replace(/(\d{3})(\d{1,2})$/, '$1-$2')
	}
	// CNPJ: 00.000.000/0000-00
	return numbers
		.replace(/(\d{2})(\d)/, '$1.$2')
		.replace(/(\d{3})(\d)/, '$1.$2')
		.replace(/(\d{3})(\d)/, '$1/$2')
		.replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const formatPhone = (text) => {
	const numbers = text.replace(/\D/g, '')
	if (numbers.length <= 10) {
		return numbers
			.replace(/(\d{2})(\d)/, '($1) $2')
			.replace(/(\d{4})(\d)/, '$1-$2')
	}
	return numbers
		.replace(/(\d{2})(\d)/, '($1) $2')
		.replace(/(\d{5})(\d)/, '$1-$2')
}

const formatCEP = (text) => {
	const numbers = text.replace(/\D/g, '')
	return numbers.replace(/(\d{5})(\d)/, '$1-$2')
}

const TextField = ({
	value,
	onChangeText,
	placeholder,
	error,
	multiline = false,
	minHeight = 0,
	className = '',
	fieldName = '',
	maxLength,
	inputType = 'text',
	editable = true,
	mask = null,
}) => {
	const isMultiline = Boolean(multiline)
	const safeValue = value != null ? String(value) : ''
	const errorMessage = !error
		? null
		: typeof error === 'string'
			? error
			: String(error)
	const safeFieldName = fieldName || ''

	const isCPFCNPJField =
		safeFieldName &&
		(safeFieldName.toLowerCase().includes('cpf') ||
			safeFieldName.toLowerCase().includes('cnpj'))

	const isCEPField =
		safeFieldName && safeFieldName.toLowerCase().includes('cep')

	const isPhoneField =
		!isCEPField &&
		safeFieldName &&
		(safeFieldName.toLowerCase().includes('telefone') ||
			safeFieldName.toLowerCase().includes('celular') ||
			inputType === 'tel')

	const getInputType = () => {
		switch (inputType) {
			case 'email':
				return 'email'
			case 'password':
				return 'password'
			case 'tel':
				return 'tel'
			case 'number':
				return 'number'
			default:
				return 'text'
		}
	}

	const handleChangeText = (text) => {
		if (mask && typeof mask === 'function') {
			const formatted = mask(text)
			onChangeText(formatted)
		} else if (isCPFCNPJField) {
			onChangeText(formatCPFCNPJ(text))
		} else if (isPhoneField) {
			onChangeText(formatPhone(text))
		} else if (isCEPField) {
			onChangeText(formatCEP(text))
		} else {
			onChangeText(text)
		}
	}

	const getMaxLength = () => {
		if (isCPFCNPJField) return 18
		if (isPhoneField) return 15
		if (isCEPField) return 9
		return maxLength
	}

	const finalMaxLength = getMaxLength()

	if (!editable) {
		return (
			<div className='space-y-1.5'>
				<div
					className={`flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3 ${className}`}
				>
					<span className='flex-1 text-sm text-foreground'>
						{safeValue || '—'}
					</span>
					<Lock className='ml-2 h-4 w-4 text-muted-foreground' />
				</div>
				{error && (
					<div className='flex items-center gap-2'>
						<div className='h-1 w-1 rounded-full bg-destructive' />
						<p className='flex-1 text-sm text-destructive'>{errorMessage}</p>
					</div>
				)}
			</div>
		)
	}

	if (isMultiline) {
		return (
			<div className='space-y-1.5'>
				<Textarea
					value={safeValue}
					onChange={(e) => handleChangeText(e.target.value)}
					placeholder={placeholder}
					className={`${error ? 'border-destructive bg-destructive/5 focus-visible:ring-destructive' : ''} ${className}`}
					style={minHeight > 0 ? { minHeight } : undefined}
					maxLength={finalMaxLength}
					rows={4}
				/>

				{error && (
					<div className='flex items-center gap-2'>
						<div className='h-1 w-1 rounded-full bg-destructive' />
						<p className='flex-1 text-sm text-destructive'>{errorMessage}</p>
					</div>
				)}
			</div>
		)
	}

	return (
		<div className='space-y-1.5'>
			<Input
				value={safeValue}
				onChange={(e) => handleChangeText(e.target.value)}
				placeholder={placeholder}
				type={getInputType()}
				className={`${error ? 'border-destructive bg-destructive/5 focus-visible:ring-destructive' : ''} ${className}`}
				maxLength={finalMaxLength}
			/>

			{error && (
				<div className='flex items-center gap-2'>
					<div className='h-1 w-1 rounded-full bg-destructive' />
					<p className='flex-1 text-sm text-destructive'>{errorMessage}</p>
				</div>
			)}
		</div>
	)
}

export default TextField
