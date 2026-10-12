import { Elysia } from 'elysia'
import { auditoriaController } from 'src/controllers/seguranca'
import { authenticate, authorize } from 'src/middleware'
import { ACOES_AUDITORIA } from 'src/services'
import { z } from 'zod'

const controller = auditoriaController()

const TAG = 'Segurança - Auditoria'

const AuditoriaQuery = z.object({
	targetUserId: z.uuid().optional(),
	actorId: z.uuid().optional(),
	action: z.enum(ACOES_AUDITORIA).optional(),
	roleId: z.uuid().optional(),
	permissionId: z.uuid().optional(),
	de: z.coerce.date().optional(),
	ate: z.coerce.date().optional(),
	page: z.coerce.number().int().positive().optional().default(1),
	pageSize: z.coerce.number().int().positive().max(200).optional().default(50)
})

export const auditoriaRoutes = new Elysia({ prefix: '/auditoria' }).get(
	'/',
	controller.listar,
	{
		beforeHandle: [authenticate, authorize('auditoria:read')],
		query: AuditoriaQuery,
		response: { 200: z.any() },
		detail: {
			tags: [TAG],
			summary: 'Trilha de auditoria das mudanças de acesso',
			description:
				'Quem concedeu ou revogou role/permissão, criou/alterou/desligou role, encerrou sessões, desativou ou excluiu usuário. Mais recente primeiro. A trilha é gravada na mesma transação da mudança e não tem rota de escrita.'
		}
	}
)
