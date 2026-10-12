import { faker } from '@faker-js/faker'

faker.seed(20260817)

let sequencia = 0

/**
 * UUID v7 válido — os schemas de resposta usam `z.uuid({ version: 'v7' })`,
 * que rejeita o v4 do faker.
 */
export function uuidV7() {
	sequencia += 1
	const sufixo = String(sequencia).padStart(12, '0')
	return `01924f8a-1111-7000-8000-${sufixo}`
}

export function card(overrides = {}) {
	return {
		id: uuidV7(),
		title: faker.lorem.words(3),
		description: faker.lorem.sentence(),
		createdAt: new Date('2026-02-01T12:00:00.000Z'),
		updatedAt: new Date('2026-02-01T12:00:00.000Z'),
		...overrides
	}
}

export function role(overrides = {}) {
	return {
		id: uuidV7(),
		name: faker.helpers.arrayElement(['ADMIN', 'EDITOR', 'VIEWER']),
		active: true,
		...overrides
	}
}

export function permission(overrides = {}) {
	return {
		id: uuidV7(),
		identifier: 'cards:read',
		name: 'Visualizar Cards',
		category: 'cards',
		active: true,
		...overrides
	}
}

export function list(factory, count = 3, overrides = {}) {
	return Array.from({ length: count }, () => factory(overrides))
}
