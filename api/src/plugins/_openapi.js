import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { settings } from 'src/config'
import { z } from 'zod'

export const openapiPlugin = new Elysia({ name: 'openapi' }).use(
	openapi({
		path: '/docs',
		specPath: '/docs/openapi.json',
		provider: 'scalar',
		// Zod v4 -> JSON Schema. `unrepresentable: 'any'` evita warnings em
		// tipos sem equivalente (ex: z.date()), emitindo schema permissivo.
		mapJsonSchema: {
			zod: schema =>
				z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' })
		},
		documentation: {
			info: {
				title: 'API Documentation',
				description: 'API description for ',
				version: '1.0.0',
				contact: {
					name: 'Equipe de Desenvolvimento',
					email: 'joaopsilvavolei@gmail.com'
				}
			},
			servers: [
				{
					url: 'http://localhost:3000',
					description: 'Servidor de desenvolvimento'
				}
			],
			security: [
				{
					CookieAuth: []
				}
			],
			components: {
				securitySchemes: {
					CookieAuth: {
						type: 'apiKey',
						in: 'cookie',
						name: settings.COOKIE_NAME,
						description:
							'Cookie httpOnly gravado no login (POST /api/seguranca/auth/session). Enviado automaticamente pelo browser — requisições cross-origin precisam de credentials: "include".'
					}
				}
			}
		},
		scalar: {
			layout: 'modern',
			theme: 'elysiajs',
			hideClientButton: false,
			showSidebar: true,
			showDeveloperTools: 'localhost',
			showToolbar: 'localhost',
			operationTitleSource: 'summary',
			persistAuth: true,
			telemetry: false,
			isEditable: false,
			isLoading: false,
			hideModels: false,
			documentDownloadType: 'both',
			hideTestRequestButton: false,
			hideSearch: false,
			showOperationId: false,
			hideDarkModeToggle: false,
			withDefaultFonts: true,
			defaultOpenAllTags: false,
			expandAllModelSections: false,
			expandAllResponses: false,
			orderSchemaPropertiesBy: 'alpha',
			orderRequiredPropertiesFirst: true
		}
	})
)

export default openapiPlugin
