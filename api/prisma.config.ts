import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
	schema: path.join('prisma', 'schema'),
	// Com o schema em pasta, o Migrate procuraria as migrations dentro dela.
	// Elas continuam em prisma/migrations.
	migrations: {
		path: path.join('prisma', 'migrations'),
		// `prisma migrate reset` e `prisma db seed` rodam isto.
		seed: 'bun prisma/seed.js'
	},
	datasource: {
		url: process.env.DATABASE_URL || ''
	}
})
