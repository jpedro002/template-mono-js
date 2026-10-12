import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Input } from 'src/components/ui/input'
import { Label } from 'src/components/ui/label'

export const CampoSenha = ({
	id,
	label,
	value,
	onChange,
	disabled,
	autoComplete,
}) => {
	const [visivel, setVisivel] = useState(false)

	return (
		<div className='space-y-2'>
			<Label htmlFor={id}>{label}</Label>
			<div className='relative'>
				<KeyRound className='pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground' />
				<Input
					id={id}
					type={visivel ? 'text' : 'password'}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					autoComplete={autoComplete}
					className='pr-10 pl-10'
				/>
				<button
					type='button'
					onClick={() => setVisivel((v) => !v)}
					className='absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground'
					aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
				>
					{visivel ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
				</button>
			</div>
		</div>
	)
}
