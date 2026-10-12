import { Elysia } from 'elysia'
import { auditoriaRoutes } from './_auditoria.route.js'
import { contaRoutes } from './_conta.route.js'
import { permissionRoutes } from './_permission.route.js'
import { roleRoutes } from './_role.route.js'
import { sessionRoutes } from './_session.route.js'
import { telemetriaRoutes } from './_telemetria.route.js'
import { userAuthorizationRoutes } from './_user-authorization.route.js'
import { usuarioRoutes } from './_usuario.route.js'

export const segurancaRoutes = new Elysia({ prefix: '/api/seguranca' })
	.use(usuarioRoutes)
	.use(sessionRoutes)
	.use(contaRoutes)
	.use(permissionRoutes)
	.use(roleRoutes)
	.use(userAuthorizationRoutes)
	.use(telemetriaRoutes)
	.use(auditoriaRoutes)
