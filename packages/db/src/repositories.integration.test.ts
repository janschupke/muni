import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { forecastEnd, planAssignments } from '@muni/domain/advisor'
import { addDays } from '@muni/utils/dates'

import {
  applyAssignments,
  createCompletion,
  getAdvisorInput,
  getComplianceMatrix,
  getCourse,
  getDashboard,
  getPersonName,
  getEmployee,
  listCourses,
  listEmployees,
  getDepartment,
  getPlannerInput,
  getPosition,
  getRoom,
  getRoomForEdit,
  listDepartmentSummaries,
  listPositionSummaries,
  getSession,
  listRooms,
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
    // No rooms file in data/: one room per place the sessions are held, of the kind its name
    // implies and sized by the largest session there; online has no seat limit.
    const rooms = await db.room.findMany({ orderBy: { name: 'asc' } })
    expect(rooms.map(r => [r.name, r.kind, r.capacity])).toEqual([
      ['Aula A', 'CLASSROOM', 40],
      ['Autoškola Vzor', 'CLASSROOM', 12],
      ['Dvůr – sklad', 'CLASSROOM', 8],
      ['Laboratoř 3', 'LAB', 20],
      ['Online', 'ONLINE', null],
      ['Seminární místnost', 'CLASSROOM', 12],
      ['Učebna 1', 'CLASSROOM', 40],
      ['Učebna 2', 'CLASSROOM', 15],
    ])
    // Who must hold what, in the split tables.
    const audience = await db.course.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        requiredForAll: true,
        departmentRequirements: { select: { department: { select: { name: true } } } },
        positionRequirements: { select: { position: { select: { name: true } } } },
      },
    })
    expect(
      audience.map(c => [
        c.code,
        c.requiredForAll,
        c.departmentRequirements.map(r => r.department.name).sort(),
        c.positionRequirements.map(r => r.position.name),
      ])
    ).toEqual([
      ['ANGL', false, [], []],
      ['BOZP-Z', true, [], []],
      ['GDPR', true, [], []],
      ['KYBER', true, [], []],
      ['LAB-BEZ', false, ['Laboratoře'], []],
      ['LEAD', false, [], ['Vedoucí']],
      ['POZ-OCH', true, [], []],
      ['PRV-POM', false, ['Knihovna', 'Laboratoře', 'Správa budov'], []],
      ['RIDIC', false, [], ['Řidič']],
      ['ZDVIH', false, [], ['Technik údržby']],
    ])
  })

  it('derives what a session needs from the sessions held, for courses nobody configured', async () => {
    const needs = await db.course.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, sessionMinutes: true, groupSize: true, onlineAllowed: true },
    })
    expect(needs.find(c => c.code === 'GDPR')).toEqual({
      code: 'GDPR',
      sessionMinutes: 120,
      groupSize: 100,
      onlineAllowed: true,
    })
    expect(needs.find(c => c.code === 'BOZP-Z')).toMatchObject({
      sessionMinutes: 180,
      groupSize: 30,
      onlineAllowed: false,
    })
    // No sessions, nothing to derive from.
    expect(needs.find(c => c.code === 'ANGL')).toMatchObject({ sessionMinutes: null })
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

  it('lists each department’s people, whose cells add up to the row and match their own list', async () => {
    const matrix = await getComplianceMatrix(options)
    for (const row of matrix.rows) {
      expect(row.people).toHaveLength(row.headcount)
      for (const course of matrix.courses) {
        const cell = row.cells[course.code]
        const held = row.people.map(p => p.cells[course.code]).filter(c => c !== null)
        expect(held.length).toBe(cell?.counts.total ?? 0)
        for (const status of ['VALID', 'EXPIRING', 'EXPIRED', 'MISSING'] as const)
          expect(held.filter(c => c?.status === status).length).toBe(cell?.counts[status] ?? 0)
      }
    }
    const lab = matrix.rows.find(r => r.department === 'Laboratoře')
    const listed = await listEmployees(
      { department: 'Laboratoře', status: 'ACTIVE', pageSize: 100 },
      options
    )
    expect(lab?.people.map(p => p.externalId)).toEqual(listed.items.map(e => e.externalId))
    for (const person of listed.items) {
      const inMatrix = lab?.people.find(p => p.externalId === person.externalId)
      expect(inMatrix?.name).toBe(`${person.lastName} ${person.firstName}`)
      expect(inMatrix?.position).toBe(person.position)
      expect(Object.values(inMatrix?.cells ?? {}).filter(c => c !== null)).toEqual(
        person.requirements
      )
    }
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
        roomId: (await db.room.findUniqueOrThrow({ where: { name: 'Učebna 1' } })).id,
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
      room: { name: 'Učebna 1', kind: 'CLASSROOM' },
      bookedCount: 3,
    })
  })

  it('lists the sessions held in one room', async () => {
    const room = await db.room.findUniqueOrThrow({ where: { name: 'Učebna 2' } })
    const sessions = await listSessions({ window: 'upcoming', room: room.id }, options)
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.every(s => s.room.id === room.id && s.room.name === 'Učebna 2')).toBe(true)
  })
})

describe('course list', () => {
  it('shows each course’s planned sessions, session needs and compliance per department', async () => {
    const [courses, matrix] = await Promise.all([
      listCourses(options),
      getComplianceMatrix(options),
    ])
    const course = (code: string) => courses.find(c => c.code === code)
    expect(course('PRV-POM')?.byDepartment.map(d => d.name)).toEqual([
      'Knihovna',
      'Laboratoře',
      'Správa budov',
    ])
    expect(course('LAB-BEZ')?.byDepartment.map(d => d.name)).toEqual(['Laboratoře'])
    // The same numbers as the matrix.
    for (const row of matrix.rows) {
      const cell = row.cells['BOZP-Z']
      expect(course('BOZP-Z')?.byDepartment.find(d => d.name === row.department)?.counts).toEqual(
        cell?.counts
      )
    }
    const bozp = course('BOZP-Z')
    expect(bozp?.sessionNeeds).toEqual({
      minutes: 180,
      groupSize: 30,
      onlineAllowed: false,
      capabilities: [],
    })
    expect(bozp?.upcoming.length).toBe(bozp?.upcomingSessions)
    expect(bozp?.upcoming.every(s => s.status === 'PLANNED' && s.courseCode === 'BOZP-Z')).toBe(
      true
    )
    expect((await getCourse('BOZP-Z', options))?.byDepartment).toEqual(bozp?.byDepartment)
    // A course's rate counts active people, as its department rows do: the rows add up to
    // it, but for the few people with no department, whom the dashboard counts the same way.
    const dashboard = await getDashboard(options)
    const outsideDepartments = (total: number, rows: { counts: { total: number } }[]) =>
      total - rows.reduce((n, d) => n + d.counts.total, 0)
    expect(
      courses.reduce((n, c) => n + outsideDepartments(c.counts.total, c.byDepartment), 0)
    ).toBe(outsideDepartments(dashboard.counts.total, dashboard.byDepartment))
  })
})

describe('departments and positions', () => {
  it('summarise each department, agreeing with the matrix', async () => {
    const [departments, matrix] = await Promise.all([
      listDepartmentSummaries(options),
      getComplianceMatrix(options),
    ])
    expect(departments).toHaveLength(9)
    for (const row of matrix.rows) {
      const department = departments.find(d => d.name === row.department)
      expect(department?.active, row.department).toBe(row.headcount)
      const total = Object.values(row.cells).reduce((n, c) => n + (c?.counts.total ?? 0), 0)
      expect(department?.counts.total, row.department).toBe(total)
      expect(department?.requiredCourses).toBe(Object.values(row.cells).filter(Boolean).length)
    }
    const lab = departments.find(d => d.name === 'Laboratoře')
    expect(lab?.head).not.toBeNull()
    expect(lab?.positions.reduce((n, p) => n + p.count, 0)).toBe(
      (lab?.active ?? 0) + (lab?.parentalLeave ?? 0)
    )
    expect(lab?.actionNow).toBeGreaterThan(0)
    // Its people, each with the same record the employee list shows, most urgent first.
    expect(lab?.members).toHaveLength((lab?.active ?? 0) + (lab?.parentalLeave ?? 0))
    expect(['EXPIRED', 'MISSING']).toContain(lab?.members[0]?.compliance)
    const first = lab?.members[0]
    const listed = await listEmployees({ q: first?.externalId }, options)
    expect(listed.items).toEqual([first])
  })

  it('show a department’s courses and why it must hold them', async () => {
    const id = (await db.department.findUniqueOrThrow({ where: { name: 'Laboratoře' } })).id
    const lab = await getDepartment(id, options)
    const matrixRow = (await getComplianceMatrix(options)).rows.find(
      r => r.department === 'Laboratoře'
    )
    expect(lab?.courses.map(c => [c.code, c.counts])).toEqual(
      Object.entries(matrixRow?.cells ?? {}).flatMap(([code, cell]) =>
        cell ? [[code, cell.counts]] : []
      )
    )
    expect(lab?.courses.find(c => c.code === 'LAB-BEZ')?.requiredBy).toEqual([
      { scope: 'DEPARTMENT', target: 'Laboratoře', targetId: id },
    ])
    expect(lab?.courses.find(c => c.code === 'BOZP-Z')?.requiredBy).toMatchObject([
      { scope: 'ALL' },
    ])
    expect(await getDepartment('nope', options)).toBeNull()
  })

  it('summarise each position and show the courses it brings', async () => {
    const positions = await listPositionSummaries(options)
    expect(positions.map(p => p.name)).toContain('Řidič')
    const driver = positions.find(p => p.name === 'Řidič')
    expect(driver?.departments.length).toBeGreaterThan(0)
    expect(driver?.members.every(m => m.position === 'Řidič')).toBe(true)
    expect(driver?.members).toHaveLength((driver?.active ?? 0) + (driver?.parentalLeave ?? 0))
    const detail = await getPosition(driver?.id ?? '', options)
    expect(detail?.courses.find(c => c.code === 'RIDIC')?.requiredBy).toMatchObject([
      { scope: 'POSITION', target: 'Řidič' },
    ])
    expect(await getPosition('nope', options)).toBeNull()
  })

  it('show a manager’s team, and filter the list by manager, department and position', async () => {
    const manager = await getEmployee('E0001', 'anonymous', options)
    expect(manager?.reports.map(r => r.externalId)).toContain('E0002')
    expect(await getPersonName('E0001', options)).toBe(
      manager && `${manager.lastName} ${manager.firstName}`
    )
    expect(await getPersonName('E9999', options)).toBeNull()
    // The team's rate counts its active people only.
    expect(manager?.teamCounts.total).toBe(
      manager?.reports.filter(r => r.status === 'ACTIVE').reduce((n, r) => n + r.counts.total, 0)
    )
    const team = await listEmployees({ manager: 'E0001', pageSize: 100 }, options)
    expect(team.items.map(e => e.externalId).toSorted()).toEqual(
      (
        await db.employee.findMany({
          // Reports who have left are not listed, as on the team card.
          where: { manager: { externalId: 'E0001' }, status: { not: 'TERMINATED' } },
          select: { externalId: true },
        })
      )
        .map(e => e.externalId)
        .toSorted()
    )
    const lab = await listEmployees({ department: 'Laboratoře', pageSize: 100 }, options)
    expect(lab.items.every(e => e.department === 'Laboratoře')).toBe(true)
    const drivers = await listEmployees({ position: 'Řidič', pageSize: 100 }, options)
    expect(drivers.total).toBeGreaterThan(0)
    expect(drivers.items.every(e => e.position === 'Řidič')).toBe(true)
  })
})

describe('planner input', () => {
  it('gives each course its needs, usual start and rooms, and the sessions that take rooms', async () => {
    const now = new Date('2026-10-16T12:00:00Z')
    const planner = await getPlannerInput({ ...options, now })
    const bozp = planner.courses.find(c => c.code === 'BOZP-Z')
    expect(bozp).toMatchObject({ sessionMinutes: 180, groupSize: 30, usualStart: '08:00' })
    const aula = planner.rooms.find(r => r.name === 'Aula A')
    expect(bozp?.heldIn).toEqual([aula?.id])
    expect(planner.courses.find(c => c.code === 'ANGL')).toMatchObject({
      usualStart: null,
      heldIn: [],
    })
    expect(planner.rooms).toHaveLength(8)
    expect(planner.sessions.length).toBeGreaterThan(0)
    expect(planner.sessions.every(s => s.endsAt >= now.toISOString())).toBe(true)
  })
})

describe('rooms', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  const roomId = async (name: string) => (await db.room.findUniqueOrThrow({ where: { name } })).id

  it('lists every room with its upcoming sessions and how booked the next 30 days are', async () => {
    const rooms = await listRooms({ ...options, now })
    expect(rooms.map(r => r.name)).toEqual([
      'Aula A',
      'Autoškola Vzor',
      'Dvůr – sklad',
      'Laboratoř 3',
      'Online',
      'Seminární místnost',
      'Učebna 1',
      'Učebna 2',
    ])
    const aula = rooms.find(r => r.name === 'Aula A')
    expect(aula?.upcomingSessions).toBeGreaterThan(0)
    // 17 Oct – 15 Nov: 19 working days once 28 October (a holiday) is out, 8 hours each.
    // Held on working days: T003, T009 (11 Nov) and T016 (4 Nov), 3 hours each; T002 falls
    // on the holiday and does not count.
    expect(aula?.utilisation).toBeCloseTo(9 / (19 * 8))
    // Online rooms have no working hours to fill.
    expect(rooms.find(r => r.name === 'Online')?.utilisation).toBeNull()
  })

  it('shows a room with its sessions and the courses it can hold', async () => {
    const id = await roomId('Učebna 2')
    const room = await getRoom(id, { ...options, now })
    expect(room).toMatchObject({ name: 'Učebna 2', kind: 'CLASSROOM', capacity: 15 })
    expect(room?.upcoming.length).toBeGreaterThan(0)
    expect(room?.upcoming.every(s => s.room.id === id)).toBe(true)
    const course = (code: string) => room?.courses.find(c => c.code === code)
    expect(course('PRV-POM')?.fit.mismatch).toBeNull()
    // Each need beside what the room has, in numbers.
    expect(course('BOZP-Z')?.fit).toMatchObject({
      online: false,
      seats: { needed: 30, provided: 15, ok: false },
      mismatch: { kind: 'TOO_SMALL', needed: 30, capacity: 15 },
    })

    const online = await getRoom(await roomId('Online'), { ...options, now })
    expect(online?.courses.find(c => c.code === 'GDPR')?.fit).toEqual({
      online: true,
      allowed: true,
      mismatch: null,
    })
    expect(online?.courses.find(c => c.code === 'BOZP-Z')?.fit.mismatch).toEqual({
      kind: 'ONLINE_NOT_ALLOWED',
    })
    expect(await getRoom('nope', options)).toBeNull()
    expect(await getRoomForEdit(id, options)).toMatchObject({ name: 'Učebna 2', capabilities: [] })
    expect(await getRoomForEdit('nope', options)).toBeNull()
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

  it('feeds the advisor what is non-compliant now and what lapses within the forecast', async () => {
    const input = await getAdvisorInput(opts)
    const cells = (await getDashboard(options)).counts
    const active = input.needs.filter(n => n.employee.status === 'ACTIVE')
    const count = (status: string) => active.filter(n => n.status === status).length
    expect([count('EXPIRED'), count('MISSING'), count('EXPIRING')]).toEqual([
      cells.EXPIRED,
      cells.MISSING,
      cells.EXPIRING,
    ])
    const end = forecastEnd(asOf)
    const valid = input.needs.filter(n => n.status === 'VALID')
    expect(valid.length).toBeGreaterThan(0)
    expect(valid.every(n => n.validUntil !== null && n.validUntil < end)).toBe(true)
    expect(input.needs.every(n => n.employee.name.length > 0)).toBe(true)

    const plan = planAssignments(input)
    expect(plan.overbooked.map(o => o.session.externalId).sort()).toEqual(['T016', 'T030'])
    expect(plan.totals.proposed).toBeGreaterThan(0)
    // "No session" exactly for the courses with nothing planned ahead.
    const scheduled = new Set(
      input.sessions.filter(s => s.status === 'PLANNED').map(s => s.courseCode)
    )
    const queued = plan.items.filter(i => i.proposal !== null)
    expect(queued.length).toBeGreaterThan(0)
    for (const item of queued)
      expect(
        item.proposal?.kind === 'NONE' && item.proposal.reason === 'NO_SESSION',
        item.need.course.code
      ).toBe(!scheduled.has(item.need.course.code))
  })

  it('shows a booking after the lapse as planned late, with its window', async () => {
    const input = await getAdvisorInput(opts)
    const need = input.needs.find(n => n.course.code === 'BOZP-Z' && n.status === 'EXPIRED')
    if (!need?.validUntil) throw new Error('fixture: nobody has an expired BOZP-Z')
    await applyAssignments([manual('T018', need.employee.externalId)], 'user_test', opts)
    const item = planAssignments(await getAdvisorInput(opts)).items.find(
      i =>
        i.need.employee.externalId === need.employee.externalId && i.need.course.code === 'BOZP-Z'
    )
    expect(item?.booked?.externalId).toBe('T018')
    expect(item).toMatchObject({
      remediation: 'PLANNED_LATE',
      window: { from: addDays(need.validUntil, 1), until: '2027-02-03' },
    })
    await removeAssignment('T018', need.employee.externalId, options)
  })

  it('shows a named booking in the matrix and the employee list', async () => {
    const input = await getAdvisorInput(opts)
    const need = input.needs.find(
      n => n.course.code === 'BOZP-Z' && n.status === 'EXPIRED' && n.employee.status === 'ACTIVE'
    )
    if (!need) throw new Error('fixture: no active employee has an expired BOZP-Z')
    await applyAssignments([manual('T018', need.employee.externalId)], 'user_test', opts)
    const booked = { sessionExternalId: 'T018', startsAt: '2027-02-03T07:00:00.000Z' }

    const matrix = await getComplianceMatrix(options)
    const person = matrix.rows
      .flatMap(r => r.people)
      .find(p => p.externalId === need.employee.externalId)
    expect(person?.cells['BOZP-Z']).toMatchObject({ status: 'EXPIRED', booked })
    const department = (await listDepartmentSummaries({ ...options, now })).find(
      d => d.name === need.employee.department
    )
    expect(department?.upcomingBookings).toBe(1)
    const listed = await listEmployees({ q: need.employee.externalId }, options)
    expect(listed.items[0]?.requirements.find(r => r.courseCode === 'BOZP-Z')?.booked).toEqual(
      booked
    )
    await removeAssignment('T018', need.employee.externalId, options)
  })

  it('applies a suggestion: the booked total follows, and a repeat is refused', async () => {
    const input = await getAdvisorInput(opts)
    const need = input.needs.find(n => n.course.code === 'BOZP-Z' && n.status === 'MISSING')
    if (!need) throw new Error('fixture: nobody misses BOZP-Z')
    const request: AssignmentRequest = {
      sessionExternalId: 'T018',
      employeeExternalId: need.employee.externalId,
      source: 'ADVISOR',
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
    expect(row).not.toHaveProperty('score')

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
  const courses = await db.course.findMany({
    include: { departmentRequirements: true, positionRequirements: true },
  })
  const required = new Set(
    courses
      .filter(
        c =>
          c.requiredForAll ||
          c.departmentRequirements.some(r => r.departmentId === employee.departmentId) ||
          c.positionRequirements.some(r => r.positionId === employee.positionId)
      )
      .map(c => c.code)
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
