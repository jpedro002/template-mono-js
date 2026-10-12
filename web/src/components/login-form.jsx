import { zodResolver } from '@hookform/resolvers/zod'
import { AtSign, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router'
import { MarcaAuth } from 'src/components/moldura-auth'
import { Button } from 'src/components/ui/button'
import { Input } from 'src/components/ui/input'
import { Label } from 'src/components/ui/label'
import { useAuth } from 'src/contexts/auth-context'
import { rotaDeRetorno } from 'src/lib/return-to'
import { cn } from 'src/lib/utils'
import { useLogin } from 'src/services/auth'
import { z } from 'zod'
import { DialogoEsqueciSenha } from './dialogo-esqueci-senha'

/**
 * Só exige que os campos estejam preenchidos. Tamanho mínimo é regra de senha
 * *nova* (redefinição) — cobrar aqui barra quem tem senha antiga mais
 * curta antes de a requisição sair, e a pessoa lê "mínimo 6 caracteres" sobre
 * uma senha que funciona.
 */
const loginSchema = z.object({
	email: z.string().min(1, 'O e-mail é obrigatório'),
	password: z.string().min(1, 'A senha é obrigatória'),
})

/**
 * Login — porta do `src/app/login/page.tsx` do Next.
 *
 * Mantém o que a rede reconhece: marca acima do formulário, ícone dentro de
 * cada campo, olho para revelar a senha, "esqueci minha senha" em diálogo e o
 * rodapé. Pontos de atenção:
 *
 * - cor por token, não `bg-[#F5F7F9]`/`primary-800`/`text-red-500` — o hex fixo
 *   não tem tema escuro e a regra §10.1 do design system barra;
 * - o botão não é empurrado por `!mt-24`; o espaçamento vem do fluxo;
 * - erro do servidor marca os dois campos (`aria-invalid`) e é anunciado por
 *   `role='alert'`, em vez de só virar um parágrafo vermelho no fim.
 */
export function LoginForm({ className, ...props }) {
	const navigate = useNavigate()
	const { search } = useLocation()
	const { isAuthenticated } = useAuth()
	const loginMutation = useLogin()

	const [mostrarSenha, setMostrarSenha] = useState(false)
	const [esqueciAberto, setEsqueciAberto] = useState(false)

	const {
		register,
		handleSubmit,
		watch,
		formState: { errors, isSubmitting },
	} = useForm({ resolver: zodResolver(loginSchema) })

	// Depois do login vai para a rota pedida antes do login (`?returnTo=`, posto
	// pelo `ProtectedRoute`) ou para a home.
	useEffect(() => {
		if (isAuthenticated) {
			navigate(rotaDeRetorno(search), { replace: true })
		}
	}, [isAuthenticated, navigate, search])

	const onSubmit = async (data) => {
		try {
			await loginMutation.mutateAsync(data)
			// Não navegar aqui, deixar o useEffect fazer
		} catch {
			// A mensagem já é renderizada a partir de `loginMutation.error`.
		}
	}

	const carregando = isSubmitting || loginMutation.isPending
	const erroServidor = loginMutation.isError
		? loginMutation.error?.response?.data?.message ||
			'E-mail ou senha incorretos. Tente novamente.'
		: null

	return (
		<div className={cn('space-y-8', className)} {...props}>
			<div className='space-y-4'>
				<MarcaAuth />
				<div className='space-y-1'>
					<h1 className='text-h1'>Entrar na sua conta</h1>
					<p className='text-body text-muted-foreground'>
						Use o e-mail cadastrado.
					</p>
				</div>
			</div>

			<form onSubmit={handleSubmit(onSubmit)} className='space-y-5' noValidate>
				<div className='space-y-2'>
					<Label htmlFor='email'>E-mail</Label>
					<div className='relative'>
						<AtSign
							aria-hidden='true'
							className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral'
						/>
						<Input
							id='email'
							type='email'
							autoComplete='email'
							placeholder='seu@exemplo.com'
							className='pl-9'
							aria-invalid={
								Boolean(errors.email) || Boolean(erroServidor) || undefined
							}
							aria-describedby={errors.email ? 'email-erro' : undefined}
							disabled={carregando}
							{...register('email')}
						/>
					</div>
					{errors.email && (
						<p id='email-erro' className='text-caption text-destructive'>
							{errors.email.message}
						</p>
					)}
				</div>

				<div className='space-y-2'>
					<Label htmlFor='password'>Senha</Label>
					<div className='relative'>
						<KeyRound
							aria-hidden='true'
							className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral'
						/>
						<Input
							id='password'
							type={mostrarSenha ? 'text' : 'password'}
							autoComplete='current-password'
							placeholder='Sua senha'
							className='pr-11 pl-9'
							aria-invalid={
								Boolean(errors.password) || Boolean(erroServidor) || undefined
							}
							aria-describedby={errors.password ? 'senha-erro' : undefined}
							disabled={carregando}
							{...register('password')}
						/>
						{/* Botão, não ícone com `onClick`: precisa chegar pelo teclado e
						    dizer o que faz. No Next era um `<EyeIcon>` clicável. */}
						<button
							type='button'
							onClick={() => setMostrarSenha((atual) => !atual)}
							aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
							aria-pressed={mostrarSenha}
							className='absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-2 text-neutral outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
						>
							{mostrarSenha ? (
								<EyeOff className='size-4' />
							) : (
								<Eye className='size-4' />
							)}
						</button>
					</div>
					{errors.password && (
						<p id='senha-erro' className='text-caption text-destructive'>
							{errors.password.message}
						</p>
					)}
				</div>

				<Button
					type='button'
					variant='link'
					className='h-auto p-0 font-medium'
					onClick={() => setEsqueciAberto(true)}
				>
					Esqueci minha senha
				</Button>

				{erroServidor && (
					<div
						role='alert'
						className='rounded-md border border-destructive/30 bg-destructive/10 p-3'
					>
						<p className='text-caption text-destructive'>{erroServidor}</p>
					</div>
				)}

				<Button type='submit' className='w-full' disabled={carregando}>
					{carregando && <Loader2 className='size-4 animate-spin' />}
					{carregando ? 'Autenticando…' : 'Entrar'}
				</Button>
			</form>

			<DialogoEsqueciSenha
				open={esqueciAberto}
				onOpenChange={setEsqueciAberto}
				emailInicial={watch('email')}
			/>
		</div>
	)
}
