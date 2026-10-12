import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from 'src/components/ui/button'
import { cn } from 'src/lib/utils'

/**
 * Marca do produto nas telas públicas. Troque o texto (ou ponha um `<img>` de
 * `public/`) pela identidade do seu projeto.
 */
export function MarcaAuth({ className }) {
	return (
		<span className={cn('font-semibold text-h3 leading-10', className)}>
			Template
		</span>
	)
}

/**
 * Casca das telas públicas — login, redefinição de senha.
 *
 * 40% de conteúdo e 60% de painel de marca: é a proporção do fluxo do Next, que
 * a rede já reconhece como tela de entrada. O que muda é a cor — lá o painel
 * era `linear-gradient(45deg, #EDDDAB, #70510F)` em hex fixo, que não tem tema
 * escuro. Aqui o gradiente sai dos tokens (`brand-light` → `brand`), então
 * escurece junto com o resto quando `.dark` entra.
 *
 * O painel é decorativo e some abaixo de `md`: no celular a tela é só o
 * formulário, como no original.
 */
export function MolduraAuth({ voltarPara, voltarRotulo, children }) {
	return (
		<div className='grid min-h-svh grid-cols-1 md:grid-cols-[40%_60%]'>
			<div className='flex flex-col gap-8 p-6 md:p-10'>
				{voltarPara && (
					<Button
						asChild
						variant='ghost'
						size='sm'
						className='-ml-2 self-start text-muted-foreground'
					>
						<Link to={voltarPara}>
							<ChevronLeft className='h-4 w-4' />
							{voltarRotulo || 'Voltar'}
						</Link>
					</Button>
				)}

				<div className='flex flex-1 items-center'>
					<div className='w-full max-w-md space-y-6'>{children}</div>
				</div>
			</div>

			<div
				aria-hidden='true'
				className='hidden items-center justify-center border-border border-l bg-gradient-to-br from-brand-light via-brand-light to-brand/40 md:flex'
			>
				<div className='flex flex-col items-center gap-4 px-10 text-center'>
					<div className='space-y-2'>
						<p className='text-display text-brand-text'>Template</p>
						<p className='mx-auto max-w-xs text-caption text-brand-text'>
							Ponto de partida para novos projetos.
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
