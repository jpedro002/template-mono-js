import { createApp } from 'src/app'
import { settings } from 'src/config'
import { logger } from 'src/helpers'

global.__basedir = __dirname // basedir global para uso em outros módulos

function main() {
	try {
		const app = createApp()
		app.listen({ port: settings.PORT, hostname: '0.0.0.0' })

		logger.info('servidor iniciado', {
			port: settings.PORT,
			env: settings.NODE_ENV,
			docs: `http://localhost:${settings.PORT}/docs`
		})
	} catch (error) {
		logger.error('falha ao iniciar o servidor', { err: error })
		process.exit(1)
	}
}

process.on('unhandledRejection', reason => {
	logger.error('promise rejeitada sem tratamento', { err: reason })
})

process.on('uncaughtException', error => {
	logger.error('exceção não capturada', { err: error })
	process.exit(1)
})

main()
