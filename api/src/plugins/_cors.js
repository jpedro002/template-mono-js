import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { settings } from 'src/config'

const allowedOrigins = (settings.CORS_ORIGIN || '')
	.split(',')
	.map(origin => origin.trim())
	.filter(Boolean)

export const corsPlugin = new Elysia({ name: 'cors' }).use(
	cors({
		origin: request => {
			const origin = request.headers.get('origin')

			// Requisições sem Origin (curl, apps mobile, server-to-server)
			if (!origin) return true

			// Correspondência EXATA. Substring permitiria que
			// "https://meusite.com.evil.com" passasse no allowlist.
			return allowedOrigins.includes(origin)
		},
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		credentials: true
	})
)

export default corsPlugin
