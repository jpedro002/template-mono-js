import { z } from 'zod'

const envSchema = z.object({
	VITE_API_URL: z
		.url('A variável VITE_API_URL deve ser uma URL válida.')
		.min(1, 'A variável VITE_API_URL é obrigatória.'),
	// Destino do "Fale Conosco" / suporte. Placeholder: aponte para o endereço
	// real no `.env`.
	VITE_SUPORTE_EMAIL: z.email().default('suporte@empresa.com.br'),
})

// Chave a chave, não `import.meta.env` inteiro: o Vite só substitui
// `import.meta.env.CHAVE` estaticamente; passar o objeto inlinearia todas as
// `VITE_*` do `.env` no bundle.
const _env = envSchema.safeParse({
	VITE_API_URL: import.meta.env.VITE_API_URL,
	VITE_SUPORTE_EMAIL: import.meta.env.VITE_SUPORTE_EMAIL,
})

if (!_env.success) {
	console.error('❌ Variáveis de ambiente inválidas:', _env.error.format())
	throw new Error(
		'As variáveis de ambiente não foram validadas pelo Zod. Verifique o console.',
	)
}

const envData = _env.data

export const settings = {
	API_URL: envData.VITE_API_URL,
	SUPORTE_EMAIL: envData.VITE_SUPORTE_EMAIL,
}

export const env = envData
