import { Loader2, Mail, Phone, TriangleAlert, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Button } from 'src/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'src/components/ui/dialog'
import { Input } from 'src/components/ui/input'
import { Label } from 'src/components/ui/label'
import { Skeleton } from 'src/components/ui/skeleton'
import { toast } from 'src/lib/toast'
import {
	useAtualizarPerfil,
	useCancelarTrocaEmail,
	useEnviarVerificacaoEmail,
	usePerfil,
	useSolicitarTrocaEmail,
} from 'src/services/perfil'

const mascararTelefone = (texto) => {
	const digitos = texto.replace(/\D/g, '').slice(0, 11)
	if (digitos.length <= 10) {
		return digitos
			.replace(/(\d{2})(\d)/, '($1) $2')
			.replace(/(\d{4})(\d)/, '$1-$2')
	}
	return digitos
		.replace(/(\d{2})(\d)/, '($1) $2')
		.replace(/(\d{5})(\d)/, '$1-$2')
}

const mensagemDeErro = (erro, padrao) =>
	erro?.response?.data?.message || erro?.message || padrao

const SEGUNDOS_REENVIO = 60

/**
 * Dados pessoais. Três campos, dois deles triviais — o e-mail é que tem
 * fluxo.
 *
 * O endereço **não** é editado por `PUT /perfil`: a API não aceita a chave.
 * Trocar exige provar posse do endereço novo (link enviado para lá) e a senha
 * atual — sem ela, uma sessão sequestrada troca o e-mail da conta e o dono
 * perde o caminho de recuperação. O sistema anterior gravava direto.
 */
export default function Page() {
	const { data: perfil, isPending } = usePerfil()
	const atualizar = useAtualizarPerfil()
	const solicitarTroca = useSolicitarTrocaEmail()
	const cancelarTroca = useCancelarTrocaEmail()
	const enviarVerificacao = useEnviarVerificacaoEmail()

	const [form, setForm] = useState({ name: '', email: '', phone: '' })
	const [dialogoAberto, setDialogoAberto] = useState(false)
	const [senha, setSenha] = useState('')
	const [espera, setEspera] = useState(0)

	// O formulário é estado local porque é editável; a query é a fonte. Depende
	// dos três valores, não do objeto: o React Query devolve uma referência nova
	// a cada refetch em background, e depender dela apagaria o que está sendo
	// digitado.
	const nomeSalvo = perfil?.name || ''
	const emailSalvo = perfil?.email || ''
	const telefoneSalvo = perfil?.phone || ''

	useEffect(() => {
		setForm({ name: nomeSalvo, email: emailSalvo, phone: telefoneSalvo })
	}, [nomeSalvo, emailSalvo, telefoneSalvo])

	useEffect(() => {
		if (espera <= 0) return
		const id = setInterval(() => setEspera((s) => (s <= 1 ? 0 : s - 1)), 1000)
		return () => clearInterval(id)
	}, [espera])

	if (isPending) {
		return (
			<div className='space-y-6'>
				<Skeleton className='h-8 w-56' />
				<Skeleton className='h-10 w-full' />
				<Skeleton className='h-10 w-full' />
				<Skeleton className='h-10 w-full' />
			</div>
		)
	}

	const pendente = perfil?.troca_email_pendente || null
	const verificado = Boolean(perfil?.emailVerifiedAt)
	// Um pedido cujo destino é o próprio endereço da conta é verificação, não
	// troca — os dois usam a mesma tabela e o mesmo link.
	const trocaPendente =
		pendente && pendente.new_email !== perfil?.email ? pendente : null
	const verificacaoPendente = Boolean(pendente && !trocaPendente)
	const emailMudou =
		form.email.trim().toLowerCase() !== (perfil?.email || '').toLowerCase()

	const salvar = async () => {
		if (!form.name.trim()) {
			toast.error('O nome é obrigatório.')
			return
		}

		if (emailMudou) {
			if (!form.email.trim()) {
				toast.error('O e-mail é obrigatório.')
				return
			}
			if (trocaPendente) {
				toast.error(
					`Já existe um pedido em andamento para ${trocaPendente.new_email}.`,
				)
				return
			}
			setSenha('')
			setDialogoAberto(true)
			return
		}

		try {
			await atualizar.mutateAsync({
				name: form.name.trim(),
				phone: form.phone.trim() || null,
			})
			toast.success('Seus dados pessoais foram atualizados.')
		} catch (erro) {
			toast.error(
				mensagemDeErro(erro, 'Não foi possível atualizar seus dados.'),
			)
		}
	}

	const confirmarTroca = async () => {
		try {
			const resposta = await solicitarTroca.mutateAsync({
				novoEmail: form.email.trim(),
				senha,
			})
			setDialogoAberto(false)
			setSenha('')
			toast.success(
				resposta?.message ||
					'Enviamos um link para confirmar a troca no novo e-mail.',
			)
		} catch (erro) {
			toast.error(mensagemDeErro(erro, 'Erro ao solicitar a troca de e-mail.'))
		}
	}

	const cancelar = async () => {
		try {
			const resposta = await cancelarTroca.mutateAsync()
			setForm((atual) => ({ ...atual, email: perfil?.email || '' }))
			toast.success(resposta?.message || 'Solicitação processada.')
		} catch (erro) {
			toast.error(mensagemDeErro(erro, 'Erro ao cancelar a alteração.'))
		}
	}

	const enviarLinkDeVerificacao = async () => {
		try {
			const resposta = await enviarVerificacao.mutateAsync()
			setEspera(SEGUNDOS_REENVIO)
			toast.success(
				resposta?.message ||
					'Enviamos um link de verificação. Confira a caixa de entrada e o spam.',
			)
		} catch (erro) {
			toast.error(mensagemDeErro(erro, 'Não foi possível enviar o e-mail.'))
		}
	}

	return (
		<div>
			<Helmet>
				<title>Dados pessoais</title>
			</Helmet>

			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-2'>
					<User className='size-6 text-primary' />
					<h1 className='font-semibold text-lg'>Dados pessoais</h1>
				</div>
				<p className='text-muted-foreground'>
					Preencha todos os campos para atualizar seus dados.
				</p>
			</div>

			<div className='space-y-6'>
				<div className='space-y-2'>
					<Label htmlFor='name'>Nome*</Label>
					<div className='relative'>
						<User className='pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground' />
						<Input
							id='name'
							value={form.name}
							onChange={(e) =>
								setForm((atual) => ({ ...atual, name: e.target.value }))
							}
							className='pl-10'
						/>
					</div>
				</div>

				<div className='space-y-2'>
					<Label htmlFor='email'>E-mail*</Label>
					<div className='relative'>
						<Mail className='pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground' />
						<Input
							id='email'
							type='email'
							value={form.email}
							onChange={(e) =>
								setForm((atual) => ({ ...atual, email: e.target.value }))
							}
							disabled={Boolean(trocaPendente)}
							className='pl-10'
						/>
					</div>

					{trocaPendente && (
						<div className='flex items-center justify-between gap-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'>
							<p>
								Atualização de e-mail pendente de confirmação. Enviamos um link
								para{' '}
								<span className='font-medium'>{trocaPendente.new_email}</span>.
							</p>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={cancelar}
								disabled={cancelarTroca.isPending}
								className='whitespace-nowrap'
							>
								{cancelarTroca.isPending
									? 'Cancelando...'
									: 'Cancelar alteração'}
							</Button>
						</div>
					)}

					{!verificado && !trocaPendente && (
						<div className='rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950'>
							<div className='space-y-2 px-3 py-3 text-amber-900 text-sm dark:text-amber-200'>
								<div className='flex items-center gap-2 font-semibold'>
									<TriangleAlert className='size-4' />
									<span>Verificação de e-mail necessária</span>
								</div>
								<p>
									Seu e-mail ainda não foi verificado. Enquanto isso, a troca de
									senha fica bloqueada. Clique abaixo para receber um link de
									confirmação em{' '}
									<span className='font-semibold'>
										{perfil?.email || 'seu e-mail'}
									</span>
									.
								</p>
								{verificacaoPendente && (
									<p>
										Já enviamos um link — se não chegou, aguarde e peça outro.
									</p>
								)}
							</div>
							<div className='flex justify-end border-amber-300 border-t px-3 py-2 dark:border-amber-900'>
								<Button
									type='button'
									variant='outline'
									size='sm'
									onClick={enviarLinkDeVerificacao}
									disabled={enviarVerificacao.isPending || espera > 0}
								>
									{enviarVerificacao.isPending ? (
										<>
											<Loader2 className='mr-2 size-4 animate-spin' />
											Enviando...
										</>
									) : espera > 0 ? (
										`Reenviar em ${espera}s`
									) : (
										'Enviar e-mail de verificação'
									)}
								</Button>
							</div>
						</div>
					)}
				</div>

				<div className='space-y-2'>
					<Label htmlFor='phone'>Telefone</Label>
					<div className='relative'>
						<Phone className='pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground' />
						<Input
							id='phone'
							type='tel'
							value={form.phone}
							onChange={(e) =>
								setForm((atual) => ({
									...atual,
									phone: mascararTelefone(e.target.value),
								}))
							}
							placeholder='(00) 90000-0000'
							maxLength={16}
							className='pl-10'
						/>
					</div>
				</div>

				<div className='flex justify-end pt-4'>
					<Button
						onClick={salvar}
						disabled={atualizar.isPending}
						className='px-8'
					>
						{atualizar.isPending ? (
							<>
								<Loader2 className='mr-2 size-4 animate-spin' />
								Salvando...
							</>
						) : (
							'Salvar alterações'
						)}
					</Button>
				</div>
			</div>

			<Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Confirmação de novo e-mail</DialogTitle>
						<DialogDescription>
							Enviaremos um link de confirmação para o novo endereço. A troca só
							acontece depois do clique nesse link.
						</DialogDescription>
					</DialogHeader>

					<div className='rounded-md border bg-muted p-3 text-sm'>
						Novo e-mail: <span className='font-medium'>{form.email}</span>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='senha-troca'>Senha atual</Label>
						<Input
							id='senha-troca'
							type='password'
							value={senha}
							onChange={(e) => setSenha(e.target.value)}
							autoComplete='current-password'
						/>
						<p className='text-muted-foreground text-xs'>
							Pedimos a senha porque trocar o e-mail troca o caminho de
							recuperação da conta.
						</p>
					</div>

					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => setDialogoAberto(false)}
						>
							Cancelar
						</Button>
						<Button
							type='button'
							onClick={confirmarTroca}
							disabled={solicitarTroca.isPending || !senha}
						>
							{solicitarTroca.isPending ? 'Enviando...' : 'Confirmar pedido'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
