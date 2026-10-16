import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import {
  createCompletion,
  getComplianceMatrix,
  getCourse,
  getDashboard,
  getEmployee,
  listCourses,
  listEmployees,
  listSessions,
  updateSession,
} from './repositories'
import { seedFromDirectory } from './seed'

const db = createDb()
const asOf = '2026-10-16'
const options = { db, asOf }
const DATA_DIR = path.join(import.meta.dirname, '../../../data')

beforeAll(async () => {
  await seedFromDirectory(db, DATA_DIR, asOf)
})

afterAll(async () => {
  await db.$disconnect()
})

describe('seed', () => {
  it('writes the expected rows', async () => {
    expect(await db.employee.count()).toBe(170)
    expect(await db.course.count()).toBe(10)
    expect(await db.courseSession.count()).toBe(32)
    expect(await importedCompletions()).toBe(2822)
    expect(await db.department.count()).toBe(9)
  })

  it('is idempotent', async () => {
    const results = await seedFromDirectory(db, DATA_DIR, asOf)
    expect(results.completions).toEqual({ created: 0, updated: 2822, skipped: 44 })
    expect(await importedCompletions()).toBe(2822)
    expect(await db.employee.count()).toBe(170)
  })

  it('links managers by email and attaches remapped records to the survivor', async () => {
    const employee = await db.employee.findUniqueOrThrow({
      where: { externalId: 'E0002' },
      include: { manager: true },
    })
    expect(employee.manager?.externalId).toBe('E0001')
    expect(await db.employee.findUnique({ where: { externalId: 'E1000' } })).toBeNull()
    const survivor = await db.employee.findUniqueOrThrow({
      where: { externalId: 'E0155' },
      include: { _count: { select: { completions: true } } },
    })
    expect(survivor._count.completions).toBeGreaterThan(0)
  })
})

describe('sanitisation', () => {
  it('never exposes the national ID or notes to anonymous viewers', async () => {
    const page = await listEmployees({ pageSize: 100 }, options)
    for (const item of page.items.slice(0, 20)) {
      const detail = await getEmployee(item.externalId, 'anonymous', options)
      const json = JSON.stringify(detail)
      expect(detail).not.toHaveProperty('nationalId')
      expect(detail).not.toHaveProperty('note')
      expect(detail?.completions.every(c => !('note' in c))).toBe(true)
      expect(json).not.toMatch(/\d{6}\/\d{3,4}/)
    }
    // List and aggregate views carry no personal fields at all.
    for (const payload of [page, await getDashboard(options), await listCourses(options)]) {
      expect(JSON.stringify(payload)).not.toMatch(/\d{6}\/\d{3,4}|@vzorova\.example/)
    }
  })

  it('masks the national ID for signed-in viewers', async () => {
    const detail = await getEmployee('E0001', 'authenticated', options)
    expect(detail?.nationalId).toBe('•••••••0359')
    expect(detail?.email).toBe('tereza.urbanova@vzorova.example')
  })

  it('masks the email for anonymous viewers', async () => {
    const detail = await getEmployee('E0001', 'anonymous', options)
    expect(detail?.email).toBe('t••••••••••••••@vzorova.example')
  })
})

describe('compliance', () => {
  it('matches a hand-computed employee', async () => {
    // E0131 (Vacková Hana): requirement statuses computed by hand from data/ as of 2026-10-16.
    const detail = await getEmployee('E0131', 'anonymous', options)
    const expected = await handComputed('E0131')
    expect(
      Object.fromEntries(detail?.requirements.map(r => [r.courseCode, r.status]) ?? [])
    ).toEqual(expected)
  })

  it('aggregates consistently across views', async () => {
    const dashboard = await getDashboard(options)
    const matrix = await getComplianceMatrix(options)
    const matrixTotal = matrix.rows
      .flatMap(r => Object.values(r.cells))
      .reduce((n, c) => n + (c?.counts.total ?? 0), 0)
    const unassigned =
      dashboard.counts.total - dashboard.byDepartment.reduce((n, d) => n + d.counts.total, 0)
    expect(matrixTotal + unassigned).toBe(dashboard.counts.total)
    expect(dashboard.rate).toBeGreaterThan(0)
    expect(dashboard.rate).toBeLessThan(1)
  })

  it('reflects a newly recorded completion', async () => {
    const before = await getEmployee('E0131', 'authenticated', options)
    const missing = before?.requirements.find(r => r.status === 'MISSING' || r.status === 'EXPIRED')
    if (!missing) return
    await createCompletion(
      'E0131',
      {
        courseCode: missing.courseCode,
        completedOn: asOf,
        validUntil: null,
        provider: 'Interní školitel',
        price: 0,
        note: null,
      },
      options
    )
    const after = await getEmployee('E0131', 'authenticated', options)
    expect(after?.requirements.find(r => r.courseCode === missing.courseCode)?.status).toBe('VALID')
  })
})

describe('sessions', () => {
  it('lists upcoming sessions in Prague time and saves edits', async () => {
    const t002 = (await getCourse('KYBER', options))?.sessions.find(s => s.externalId === 'T002')
    expect(t002?.startsAt).toBe('2026-10-28T08:00:00.000Z') // 09:00 CET (after DST ends)
    await updateSession(
      'T002',
      {
        date: '2026-10-28',
        startTime: '10:00',
        endTime: '12:00',
        location: 'Aula B',
        isOnline: false,
        capacity: 40,
        bookedCount: 3,
        pricePerPerson: 800,
        status: 'PLANNED',
      },
      options
    )
    const sessions = await listSessions({ window: 'upcoming', course: 'KYBER' }, options)
    expect(sessions.find(s => s.externalId === 'T002')).toMatchObject({
      startsAt: '2026-10-28T09:00:00.000Z',
      location: 'Aula B',
      bookedCount: 3,
    })
  })
})

/** Completions from the CSV (app-recorded ones get an `A` prefix and may exist from earlier runs). */
const importedCompletions = () =>
  db.courseCompletion.count({ where: { externalId: { startsWith: 'Z' } } })

/** Independent re-computation straight from the tables, for one employee. */
async function handComputed(externalId: string): Promise<Record<string, string>> {
  const employee = await db.employee.findUniqueOrThrow({
    where: { externalId },
    include: { completions: { include: { course: true } } },
  })
  const requirements = await db.courseRequirement.findMany({ include: { course: true } })
  const required = new Set(
    requirements
      .filter(
        r =>
          r.scope === 'ALL' ||
          (r.scope === 'DEPARTMENT' && r.departmentId === employee.departmentId) ||
          (r.scope === 'POSITION' && r.positionId === employee.positionId)
      )
      .map(r => r.course.code)
  )
  const out: Record<string, string> = {}
  for (const code of required) {
    const held = employee.completions.filter(
      c => c.course.code === code && c.completedOn.toISOString().slice(0, 10) <= asOf
    )
    if (held.length === 0) {
      out[code] = 'MISSING'
      continue
    }
    if (held.some(c => c.validUntil === null)) {
      out[code] = 'VALID'
      continue
    }
    const latest =
      held
        .map(c => c.validUntil?.toISOString().slice(0, 10) ?? '')
        .sort()
        .at(-1) ?? ''
    const days = (Date.parse(latest) - Date.parse(asOf)) / 86_400_000
    out[code] = latest < asOf ? 'EXPIRED' : days <= 30 ? 'EXPIRING' : 'VALID'
  }
  return out
}
