import { randomUUID } from 'node:crypto'

import { afterAll } from 'vitest'

import { createDb } from '../src/connect'
import { TEMPLATE, testServer, withDatabase } from './databases'

// Runs before each integration test file is loaded: the file gets a database of its own, a
// copy of the seeded template, and DATABASE_URL points at it (what createDb() and the app's
// getDb() read). Nothing a file writes reaches another, so files need no clean-up and run
// side by side.

const server = testServer()
const name = `muni_test_${randomUUID().slice(0, 8)}`
const admin = createDb(server)
await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE}"`)
process.env.DATABASE_URL = withDatabase(server, name)
process.env.DIRECT_URL = process.env.DATABASE_URL

afterAll(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.$disconnect()
})
