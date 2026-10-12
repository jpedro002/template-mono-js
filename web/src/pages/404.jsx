import { ArrowLeft, Compass, Home } from 'lucide-react'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router'
import { MarcaAuth } from 'src/components/moldura-auth'
import { Button } from 'src/components/ui/button'

/**
 * Ilustração da 404 ("Encruzilhada do Estudante Perdido"). Gerada a partir do
 * original de 1254px/1,4 MB: 360px (1x, 22 KB) e 720px (2x, 60 KB), com a borda
 * esfumada em alpha para o fundo creme da arte sumir no card em vez de virar
 * um quadrado. Se o arquivo falhar, entra o desenho vetorial — a tela nunca
 * fica com imagem quebrada.
 */
const IMAGEM = '/404.webp'
const IMAGEM_2X = '/404@2x.webp'

function Ilustracao() {
	const [falhou, setFalhou] = useState(false)

	if (!falhou)
		return (
			<img
				src={IMAGEM}
				srcSet={`${IMAGEM} 1x, ${IMAGEM_2X} 2x`}
				width={360}
				height={360}
				alt=''
				aria-hidden
				decoding='async'
				onError={() => setFalhou(true)}
				className='mx-auto aspect-square w-full max-w-80 object-contain'
			/>
		)

	return (
		<div className='relative mx-auto grid aspect-square w-full max-w-72 place-items-center'>
			<div className='absolute inset-6 rounded-full bg-brand-light' />
			<div className='absolute inset-14 rounded-full border-2 border-brand-strong/30 border-dashed' />
			<span className='relative font-black text-[5.5rem] text-brand-text leading-none tracking-tighter'>
				404
			</span>
			<Compass
				className='absolute right-10 bottom-12 size-12 rotate-12 text-brand'
				strokeWidth={1.5}
				aria-hidden
			/>
		</div>
	)
}

const NotFound = () => {
	const navigate = useNavigate()

	return (
		<main className='flex min-h-svh items-center justify-center bg-background p-4'>
			<Helmet>
				{/* Escrito à mão, como o `index.html` da onda 1: o título vinha do
				    ambiente, e o `.env` não é versionado — nenhum arquivo do
				    repositório garantiria o valor. */}
				<title>Página não encontrada</title>
			</Helmet>

			<div className='grid w-full max-w-4xl items-center gap-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-10 md:grid-cols-[1fr_1.1fr]'>
				<div className='order-2 flex flex-col gap-6 md:order-1'>
					<MarcaAuth className='h-9 self-start' />
					<div>
						<p className='text-overline text-brand-text uppercase'>Erro 404</p>
						<h1 className='mt-1 text-h1'>Página não encontrada</h1>
						<p className='mt-2 text-body text-muted-foreground'>
							O endereço não existe ou foi movido. Confira o link ou volte para
							o início.
						</p>
					</div>
					<div className='flex flex-col gap-2 sm:flex-row'>
						<Button onClick={() => navigate('/')}>
							<Home />
							Ir para o início
						</Button>
						<Button variant='outline' onClick={() => navigate(-1)}>
							<ArrowLeft />
							Voltar
						</Button>
					</div>
				</div>
				<div className='order-1 md:order-2'>
					<Ilustracao />
				</div>
			</div>
		</main>
	)
}

export default NotFound
export { NotFound }
