import { prisma } from 'src/services'

/**
 * Leitura da trilha de auditoria de acesso (`seguranca.authz_audit`).
 *
 * Só leitura: a trilha não tem rota de escrita, edição nem exclusão — quem
 * pudesse apagar a linha da própria escalada não teria trilha nenhuma.
 */
export const auditoriaController = () => {
	const listar = async ({ query }) => {
		const {
			targetUserId,
			actorId,
			action,
			roleId,
			permissionId,
			de,
			ate,
			page = 1,
			pageSize = 50
		} = query

		const where = {
			...(targetUserId && { targetUserId }),
			...(actorId && { actorId }),
			...(action && { action }),
			...(roleId && { roleId }),
			...(permissionId && { permissionId }),
			...((de || ate) && {
				createdAt: {
					...(de && { gte: de }),
					...(ate && { lte: ate })
				}
			})
		}

		const [rowCount, data] = await Promise.all([
			prisma.authzAudit.count({ where }),
			prisma.authzAudit.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take: pageSize,
				skip: (page - 1) * pageSize
			})
		])

		return {
			data,
			pagination: {
				page,
				rowCount,
				pageCount: Math.ceil(rowCount / pageSize) || 1,
				pageSize
			}
		}
	}

	return { listar }
}
