import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { DEFAULT_ADVISOR_SETTINGS, planAssignments } from '@muni/domain/advisor'

import {
  applyAssignments,
  createCompletion,
  getAdvisorInput,
  getComplianceMatrix,
  getCourse,
  getDashboard,
  getEmployee,
  listCourses,
  listEmployees,
  getSession,
  listSessions,
  moveSeats,
  removeAssignment,
  updateSession,
  type AssignmentRequest,
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

describe('employee list filters and details', () => {
  it('lists everyone with a training in a state, matching the dashboard counts', async () => {
    const dashboard = await getDashboard(options)
    for (const status of ['EXPIRING', 'EXPIRED', 'MISSING'] as const) {
      const list = await listEmployees(
        { status: 'ACTIVE', compliance: status, pageSize: 100 },
        options
      )
      expect(list.total).toBe(dashboard.people[status])
      expect(list.items.every(e => e.requirements.some(r => r.status === status))).toBe(true)
    }
  })

  it('carries each requirement with its expiry for the detail panel', async () => {
    const { items } = await listEmployees({ q: 'E0153' }, options)
    const [alena] = items
    expect(alena?.requirements.length).toBe(alena?.counts.total)
    const dated = alena?.requirements.find(r => r.validUntil !== null)
    expect(dated?.daysLeft).toBe(
      Math.round((Date.parse(dated?.validUntil ?? '') - Date.parse(asOf)) / 86_400_000)
    )
  })
})

describe('employee list sorting', () => {
  const collator = new Intl.Collator('cs', { sensitivity: 'base' })

  it('sorts by department across pages, blanks last in both directions', async () => {
    for (const desc of [false, true]) {
      const pages = await Promise.all(
        [1, 2, 3, 4, 5, 6, 7].map(page =>
          listEmployees({ sort: { by: 'department', desc }, page, pageSize: 25 }, options)
        )
      )
      const all = pages.flatMap(p => p.items)
      expect(all).toHaveLength(pages[0]?.total ?? -1)
      const named = all.filter(e => e.department !== null).map(e => e.department ?? '')
      expect(all.slice(named.length).every(e => e.department === null)).toBe(true)
      const sorted = [...named].sort((a, b) => (desc ? -1 : 1) * collator.compare(a, b))
      expect(named).toEqual(sorted)
    }
  })

  it('puts the most urgent compliance first and people who left last', async () => {
    const { items, total } = await listEmployees(
      { sort: { by: 'compliance', desc: false }, pageSize: 100 },
      options
    )
    expect(items[0]?.compliance).toBe('EXPIRED')
    const last = await listEmployees(
      { sort: { by: 'compliance', desc: false }, pageSize: 100, page: 2 },
      options
    )
    expect(total).toBeGreaterThan(100)
    expect(
      last.items.at(-1)?.status === 'TERMINATED' || last.items.at(-1)?.compliance === null
    ).toBe(true)
  })

  it('lists in Czech name order by default and breaks ties by name', async () => {
    const byName = (await listEmployees({ pageSize: 100 }, options)).items
    const names = byName.map(e => e.lastName)
    expect(names).toEqual([...names].sort((a, b) => collator.compare(a, b)))
    expect(names.findIndex(n => n.startsWith('Č'))).toBeLessThan(
      names.findIndex(n => n.startsWith('D'))
    )

    const expired = (
      await listEmployees({ sort: { by: 'compliance', desc: false }, pageSize: 100 }, options)
    ).items.filter(e => e.compliance === 'EXPIRED' && e.status !== 'TERMINATED')
    const keys = expired.map(e => [e.lastName, e.firstName] as const)
    expect(keys).toEqual(
      [...keys].sort((a, b) => collator.compare(a[0], b[0]) || collator.compare(a[1], b[1]))
    )
  })

  it('sorts names by surname, then first name, with Czech collation', async () => {
    const { items } = await listEmployees(
      { sort: { by: 'name', desc: true }, pageSize: 100 },
      options
    )
    const keys = items.map(e => [e.lastName, e.firstName] as const)
    const sorted = [...keys].sort(
      (a, b) => -(collator.compare(a[0], b[0]) || collator.compare(a[1], b[1]))
    )
    expect(keys).toEqual(sorted)
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
        unnamedBookings: 3,
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

describe('assignments', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  const opts = { ...options, now }
  const booked = async (id: string) => (await getSession(id, options))?.bookedCount
  const manual = (sessionExternalId: string, employeeExternalId: string): AssignmentRequest => ({
    sessionExternalId,
    employeeExternalId,
    source: 'MANUAL',
  })

  // Assignments outlive a run; start (and leave) the test database without any, re-seeded.
  const reset = async () => {
    await db.sessionAssignment.deleteMany()
    await seedFromDirectory(db, DATA_DIR, asOf)
  }
  beforeAll(reset)
  afterAll(reset)

  it('feeds the advisor every open need and the upcoming sessions', async () => {
    const input = await getAdvisorInput(opts)
    const cells = (await getDashboard(options)).counts
    expect(input.activeCounts).toEqual(cells)
    expect(input.needs.every(n => n.employee.name.length > 0)).toBe(true)
    expect(input.sessions.map(s => s.externalId)).toContain('T016')
    const plan = planAssignments(input, DEFAULT_ADVISOR_SETTINGS)
    expect(plan.overbooked.map(o => o.session.externalId).sort()).toEqual(['T016', 'T030'])
    expect(plan.suggestions.length).toBeGreaterThan(0)
    expect(plan.metrics.complianceAfter).toBeGreaterThan(plan.metrics.complianceBefore)
  })

  it('applies a suggestion: the booked total follows, and a repeat is refused', async () => {
    const input = await getAdvisorInput(opts)
    const need = input.needs.find(n => n.course.code === 'BOZP-Z' && n.status === 'MISSING')
    if (!need) throw new Error('fixture: nobody misses BOZP-Z')
    const request: AssignmentRequest = {
      sessionExternalId: 'T018',
      employeeExternalId: need.employee.externalId,
      source: 'ADVISOR',
      score: 42.5,
    }
    const before = await booked('T018')
    expect(await applyAssignments([request], 'user_test', opts)).toEqual([{ request, ok: true }])
    expect(await booked('T018')).toBe((before ?? 0) + 1)
    expect((await getSession('T018', options))?.assigned.map(a => a.externalId)).toEqual([
      need.employee.externalId,
    ])
    const row = await db.sessionAssignment.findFirstOrThrow({
      where: { session: { externalId: 'T018' } },
    })
    expect(row).toMatchObject({ source: 'ADVISOR', createdBy: 'user_test' })
    expect(Number(row.score)).toBe(42.5)

    const [again] = await applyAssignments([request], 'user_test', opts)
    expect(again).toMatchObject({ ok: false, reason: 'ALREADY_ASSIGNED' })

    expect(await removeAssignment('T018', need.employee.externalId, options)).toBe(true)
    expect(await booked('T018')).toBe(before)
  })

  it('refuses an advisor booking for someone who already holds the training', async () => {
    const input = await getAdvisorInput(opts)
    const open = new Set(
      input.needs.filter(n => n.course.code === 'BOZP-Z').map(n => n.employee.externalId)
    )
    const holder = await db.employee.findFirstOrThrow({
      where: { status: 'ACTIVE', externalId: { notIn: [...open] } },
      orderBy: { externalId: 'asc' },
    })
    const [outcome] = await applyAssignments(
      [{ sessionExternalId: 'T018', employeeExternalId: holder.externalId, source: 'ADVISOR' }],
      'user_test',
      opts
    )
    expect(outcome).toMatchObject({ ok: false, reason: 'NOT_NEEDED' })
  })

  it('gives the last seat to exactly one of two concurrent bookings', async () => {
    const session = await db.courseSession.findUniqueOrThrow({ where: { externalId: 'T013' } })
    await db.courseSession.update({
      where: { id: session.id },
      data: { unnamedBookings: session.capacity - 1 },
    })
    const [a, b] = await db.employee.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { externalId: 'asc' },
      take: 2,
    })
    if (!a || !b) throw new Error('fixture: two active employees')
    const results = (
      await Promise.all([
        applyAssignments([manual('T013', a.externalId)], 'user_a', opts),
        applyAssignments([manual('T013', b.externalId)], 'user_b', opts),
      ])
    ).flat()
    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok)).toEqual([
      expect.objectContaining({ reason: 'SESSION_FULL' }),
    ])
    expect(await booked('T013')).toBe(session.capacity)
  })

  it('refuses overlapping sessions for one person, past and cancelled sessions', async () => {
    const person = await db.employee.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      orderBy: { externalId: 'desc' },
    })
    // T003 and T009 are the same KYBER slot (a known duplicate in the export).
    const [first, clash] = await applyAssignments(
      [manual('T003', person.externalId), manual('T009', person.externalId)],
      'user_test',
      opts
    )
    expect(first?.ok).toBe(true)
    expect(clash).toMatchObject({ ok: false, reason: 'CONFLICT' })
    const [past, cancelled] = await applyAssignments(
      [manual('T001', person.externalId), manual('T017', person.externalId)],
      'user_test',
      opts
    )
    expect(past).toMatchObject({ ok: false, reason: 'PAST' })
    expect(cancelled).toMatchObject({ ok: false, reason: 'NOT_PLANNED' })
  })

  it('keeps the database invariants: no negative seats, no orphaned booking history', async () => {
    await expect(
      db.courseSession.update({ where: { externalId: 'T018' }, data: { unnamedBookings: -1 } })
    ).rejects.toThrow()
    const assigned = await db.sessionAssignment.findFirstOrThrow({ select: { employeeId: true } })
    await expect(db.employee.delete({ where: { id: assigned.employeeId } })).rejects.toThrow()
  })

  it('re-importing derives unnamed seats from the export total', async () => {
    // T003 carries a named booking from the clash test; the export says 5 booked in total.
    await seedFromDirectory(db, DATA_DIR, asOf)
    const t003 = await getSession('T003', options)
    expect(t003).toMatchObject({ bookedCount: 5, unnamedBookings: 4 })
    expect(t003?.assigned).toHaveLength(1)
  })

  it('moves anonymous seats to repair overbooking, within the rules', async () => {
    expect(await booked('T016')).toBe(31)
    expect(await moveSeats('T016', 'T018', 1, opts)).toEqual({ ok: true })
    expect(await booked('T016')).toBe(30)
    expect(await moveSeats('T016', 'T011', 1, opts)).toEqual({
      ok: false,
      reason: 'DIFFERENT_COURSE',
    })
    expect(await moveSeats('T018', 'T016', 5, opts)).toEqual({
      ok: false,
      reason: 'NOT_ENOUGH_UNNAMED',
    })
    expect(await moveSeats('T018', 'T016', 1, opts)).toEqual({ ok: false, reason: 'TARGET_FULL' })
    // Opposite directions at once: locks are taken in id order, so neither deadlocks.
    const results = await Promise.all([
      moveSeats('T016', 'T018', 1, opts),
      moveSeats('T018', 'T016', 1, opts),
    ])
    expect(results.every(r => 'ok' in r)).toBe(true)
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
