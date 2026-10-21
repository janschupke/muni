import { createDb } from '@muni/db/connect'

import { TEST_DB } from './server'

/** Empties every table of a test database but the migrations' own, for a seed from scratch. */
export async function emptyTestDb(url: string): Promise<void> {
  const db = createDb(url)
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    if (tables.length > 0)
      await db.$executeRawUnsafe(
        `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
      )
  } finally {
    await db.$disconnect()
  }
}

/** A kind of seeded record whose pages the suites visit (pages.ts). */
export type SeededRecord =
  'department' | 'position' | 'room' | 'provider' | 'user' | 'completion of E0153'

const recordPaths = new Map<SeededRecord, Promise<string>>()

/** The page of the first active record of the kind, by name: read once per run. */
export function firstRecordPath(record: SeededRecord): Promise<string> {
  let found = recordPaths.get(record)
  if (!found) {
    found = readFirstRecordPath(record)
    recordPaths.set(record, found)
  }
  return found
}

async function readFirstRecordPath(record: SeededRecord): Promise<string> {
  const db = createDb(TEST_DB)
  const active = { archivedAt: null }
  const byName = { orderBy: { name: 'asc' as const }, select: { id: true } }
  try {
    const row = await (() => {
      switch (record) {
        case 'department':
          return db.department.findFirst({ where: active, ...byName })
        case 'position':
          return db.position.findFirst({ where: active, ...byName })
        case 'room':
          return db.room.findFirst({ where: active, ...byName })
        case 'provider':
          return db.provider.findFirst({ where: active, ...byName })
        case 'user':
          return db.user.findFirst({
            where: active,
            orderBy: { email: 'asc' },
            select: { id: true },
          })
        case 'completion of E0153':
          return db.courseCompletion.findFirst({
            where: { ...active, employee: { externalId: 'E0153' } },
            orderBy: { completedOn: 'desc' },
            select: { id: true },
          })
      }
    })()
    if (!row) throw new Error(`no seeded ${record}`)
    const base = {
      department: '/departments',
      position: '/positions',
      room: '/rooms',
      provider: '/providers',
      user: '/users',
      'completion of E0153': '/employees/E0153/completions',
    }[record]
    return `${base}/${row.id}`
  } finally {
    await db.$disconnect()
  }
}

/** How many active providers the register holds, as its lists should show. */
export async function activeProviders(): Promise<number> {
  const db = createDb(TEST_DB)
  try {
    return await db.provider.count({ where: { archivedAt: null } })
  } finally {
    await db.$disconnect()
  }
}
