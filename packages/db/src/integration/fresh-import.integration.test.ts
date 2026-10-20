import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { DERIVED_AS_OF } from '@muni/importer/derive'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from '../connect'
import type { PrismaClient } from '../generated/prisma/client'
import { ACTIVE } from '../repositories/archive/archive'
import { seedFromDirectory } from '../seed'

// A new register, as a fresh deployment starts: an empty database of its own (beside the
// suite's, on the test server), migrated, then filled with data/import through the path the
// import wizard takes: the browser's reading and review, then the chunked commit.

const DATA = path.join(import.meta.dirname, '../../../../data')
const IMPORT = path.join(DATA, 'import')
const NAME = `muni_fresh_${String(process.pid)}`
const admin = createDb()
let url = ''
let db: PrismaClient

async function empty() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
  )
}

/** What a register holds, by source keys: two imports that agree on it wrote the same. */
async function stateOf() {
  const people = await db.employee.findMany({
    where: ACTIVE,
    select: {
      externalId: true,
      leadsDepartment: true,
      department: { select: { name: true } },
      manager: { select: { externalId: true } },
    },
    orderBy: { externalId: 'asc' },
  })
  const providers = await db.provider.findMany({
    select: {
      name: true,
      isDefault: true,
      offerings: { select: { course: { select: { code: true } }, pricePerPerson: true } },
    },
    orderBy: { name: 'asc' },
  })
  return {
    counts: {
      employees: people.length,
      courses: await db.course.count(),
      sessions: await db.courseSession.count(),
      completions: await db.courseCompletion.count(),
      rooms: await db.room.count(),
      departments: await db.department.count(),
    },
    managers: people.map(p => [p.externalId, p.manager?.externalId ?? null] as const),
    heads: people
      .filter(p => p.leadsDepartment)
      .map(p => [p.department?.name, p.externalId])
      .sort(),
    providers: providers.map(p => ({
      name: p.name,
      isDefault: p.isDefault,
      offers: p.offerings.map(o => `${o.course.code} ${o.pricePerPerson.toString()}`).sort(),
    })),
    rooms: (
      await db.room.findMany({
        select: { name: true, kind: true, capacity: true },
        orderBy: { name: 'asc' },
      })
    ).map(r => [r.name, r.kind, r.capacity]),
  }
}

/** The derived file's rows, by header. */
function rowsOf(name: string) {
  const [header, ...lines] = readFileSync(path.join(IMPORT, name), 'utf8').trimEnd().split('\n')
  const keys = (header ?? '').split(',')
  return lines.map(
    line =>
      Object.fromEntries(line.split(',').map((v, i) => [keys[i] ?? '', v])) as Record<
        string,
        string
      >
  )
}

beforeAll(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NAME}"`)
  await admin.$executeRawUnsafe(`CREATE DATABASE "${NAME}"`)
  const base = new URL(process.env.DATABASE_URL ?? '')
  base.pathname = `/${NAME}`
  url = base.toString()
  execFileSync('prisma', ['migrate', 'deploy'], {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })
  db = createDb(url)
}, 120_000)

afterAll(async () => {
  await db.$disconnect()
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`)
  await admin.$disconnect()
})

describe('a fresh register filled from data/import', () => {
  let first: Awaited<ReturnType<typeof stateOf>>

  it('starts empty: no provider, so none is the default', async () => {
    expect(await db.employee.count()).toBe(0)
    expect(await db.provider.count()).toBe(0)
  })

  it('takes every row of the import files, and works out what the files leave open', async () => {
    const results = await seedFromDirectory(db, IMPORT, DERIVED_AS_OF)
    expect(results).toEqual({
      rooms: { created: 9, updated: 0, skipped: 0 },
      courses: { created: 10, updated: 0, skipped: 0 },
      employees: { created: 170, updated: 0, skipped: 0 },
      completions: { created: 2814, updated: 0, skipped: 0 },
      sessions: { created: 32, updated: 0, skipped: 0 },
    })
    first = await stateOf()
    expect(first.counts).toEqual({
      employees: 170,
      courses: 10,
      sessions: 32,
      completions: 2814,
      rooms: 9,
      departments: 9,
    })
    // The rooms are the rooms file's, not guessed from the sessions.
    expect(first.rooms).toEqual(
      rowsOf('mistnosti.csv').map(r => [
        r['nazev'],
        expect.any(String) as unknown,
        r['kapacita'] === '' ? null : Number(r['kapacita']),
      ])
    )
    // The default is chosen from all the completions: the internal trainer.
    expect(first.providers.filter(p => p.isDefault).map(p => p.name)).toEqual(['Interní školitel'])
    // Every session's provider offers its course.
    const sessions = await db.courseSession.findMany({
      select: {
        courseId: true,
        provider: { select: { offerings: { select: { courseId: true } } } },
      },
    })
    expect(
      sessions.filter(s => !s.provider.offerings.some(o => o.courseId === s.courseId))
    ).toEqual([])
  }, 300_000)

  it('links every person to the manager the file names, and gives departments heads', () => {
    const emails = new Map(rowsOf('zamestnanci.csv').map(r => [r['email'], r['id_zamestnance']]))
    const named = rowsOf('zamestnanci.csv').flatMap(r =>
      r['vedouci_email'] && emails.has(r['vedouci_email'])
        ? [[r['id_zamestnance'], emails.get(r['vedouci_email'])]]
        : []
    )
    const linked = new Map(first.managers)
    expect(named.filter(([id, manager]) => linked.get(id ?? '') !== manager)).toEqual([])
    expect(first.heads.length).toBeGreaterThan(0)
  })

  it('comes out the same written in small chunks: links, heads and the default do not depend on them', async () => {
    await empty()
    await seedFromDirectory(db, IMPORT, DERIVED_AS_OF, { chunkSize: 40 })
    expect(await stateOf()).toEqual(first)
  }, 300_000)

  it('changes nothing imported again', async () => {
    const again = await seedFromDirectory(db, IMPORT, DERIVED_AS_OF)
    expect(Object.values(again).map(r => r.created)).toEqual([0, 0, 0, 0, 0])
    expect(await stateOf()).toEqual(first)
  }, 300_000)

  it('takes the raw exports on top without failing, adding only what the derived files left out', async () => {
    const raw = await seedFromDirectory(db, DATA, DERIVED_AS_OF)
    // The five completions whose name belongs to another person are valid to the importer.
    expect(raw.completions?.created).toBe(5)
    expect(raw.sessions?.created).toBe(0)
    expect(raw.employees?.created).toBe(0)
  }, 300_000)
})
