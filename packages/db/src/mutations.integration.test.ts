import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createDb, getDb } from './client'
import {
  applyAssignments,
  createCompletion,
  getAdvisorInput,
  getCourse,
  getCourseForEdit,
  getEmployee,
  getEmployeeForEdit,
  getSession,
  listEmployees,
  listCourseOptions,
  listDepartments,
  listEmployeeBookings,
  listPositions,
  listProviders,
  listSessions,
  moveSeats,
  removeAssignment,
  updateCourse,
  updateEmployee,
} from './repositories'
import { complianceOptions, dbOf } from './repositories/context'
import { seedFromDirectory } from './seed'
import { CommitValidationError, COMMIT_CHUNK_SIZE, commitChunk } from './writer'

// Writes that the main suite does not exercise. Everything here is undone in afterAll:
// a re-seed restores edited rows (upsert by source ID) and app-created rows are deleted.

const db = createDb()
const asOf = '2026-10-16'
const options = { db, asOf }
const now = new Date('2026-10-16T12:00:00Z')
const DATA_DIR = path.join(import.meta.dirname, '../../../data')

// Names the tests create, which a re-seed does not remove.
const CREATED = {
  department: 'Nové oddělení',
  provider: 'Školicí centrum Vzor',
  position: 'Zkušební pozice',
} as const

const restore = async () => {
  await db.sessionAssignment.deleteMany()
  await db.courseCompletion.deleteMany({ where: { externalId: { startsWith: 'A' } } })
  await db.course.deleteMany({ where: { code: { startsWith: 'TEST-' } } })
  await seedFromDirectory(db, DATA_DIR, asOf)
  await db.department.deleteMany({ where: { name: CREATED.department } })
  await db.provider.deleteMany({ where: { name: CREATED.provider } })
  await db.position.deleteMany({ where: { name: CREATED.position } })
}

beforeAll(restore)
afterAll(async () => {
  await restore()
  await db.$disconnect()
})

describe('lookups and edit loaders', () => {
  it('lists departments, positions and providers in name order', async () => {
    for (const list of [
      await listDepartments(options),
      await listPositions(options),
      await listProviders(options),
    ]) {
      expect(list.length).toBeGreaterThan(0)
      expect(list).toEqual(list.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    expect(await listDepartments(options)).toContain('Laboratoře')
  })

  it('loads a course and a person for editing, or nothing', async () => {
    expect(await getCourseForEdit('BOZP-Z', options)).toEqual({
      code: 'BOZP-Z',
      name: 'BOZP – základní školení',
      validityMonths: 24,
    })
    expect(await getCourseForEdit('NOPE', options)).toBeNull()
    expect((await listCourseOptions(options)).map(c => c.code)).toContain('LAB-BEZ')
    expect(await getEmployeeForEdit('E0153', options)).toMatchObject({
      externalId: 'E0153',
      hiredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
    })
    expect(await getEmployeeForEdit('E9999', options)).toBeNull()
  })

  it('returns nothing for a course or person that does not exist', async () => {
    expect(await getCourse('NOPE', options)).toBeNull()
    expect(await getEmployee('E9999', 'anonymous', options)).toBeNull()
  })

  it('finds people by name, ignoring case and diacritics', async () => {
    const page = await listEmployees({ q: 'cerna' }, options)
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every(e => /čern/i.test(`${e.lastName} ${e.firstName}`))).toBe(true)
  })
})

describe('edits', () => {
  it('renames a course and changes its validity', async () => {
    await updateCourse('ANGL', { name: 'Angličtina pro pokročilé', validityMonths: 12 }, options)
    expect(await getCourseForEdit('ANGL', options)).toMatchObject({
      name: 'Angličtina pro pokročilé',
      validityMonths: 12,
    })
  })

  it('edits a person, creating a new department and clearing the position', async () => {
    const before = await getEmployeeForEdit('E0153', options)
    if (!before) throw new Error('fixture: E0153 missing')
    await updateEmployee(
      'E0153',
      {
        ...before,
        department: CREATED.department,
        position: null,
        leftOn: '2026-12-31',
        note: '  odchází  ',
      },
      options
    )
    expect(await getEmployeeForEdit('E0153', options)).toMatchObject({
      department: CREATED.department,
      position: null,
      leftOn: '2026-12-31',
      note: 'odchází',
    })
    expect(await listDepartments(options)).toContain(CREATED.department)
  })

  it('sets a position and clears the leaving date', async () => {
    const before = await getEmployeeForEdit('E0153', options)
    if (!before) throw new Error('fixture: E0153 missing')
    await updateEmployee('E0153', { ...before, position: CREATED.position, leftOn: null }, options)
    expect(await getEmployeeForEdit('E0153', options)).toMatchObject({
      position: CREATED.position,
      leftOn: null,
    })
  })

  it('records completions entered in the app, with and without a provider', async () => {
    const withProvider = await createCompletion(
      'E0153',
      {
        courseCode: 'GDPR',
        completedOn: '2026-10-01',
        validUntil: '2028-10-01',
        provider: CREATED.provider,
        price: 600,
        note: null,
      },
      options
    )
    const bare = await createCompletion(
      'E0153',
      {
        courseCode: 'LEAD',
        completedOn: '2026-10-02',
        validUntil: null,
        provider: null,
        price: null,
        note: null,
      },
      options
    )
    expect(withProvider.externalId).toMatch(/^A[0-9A-Z]+$/)
    const completions = (await getEmployee('E0153', 'authenticated', options))?.completions ?? []
    expect(completions.find(c => c.externalId === withProvider.externalId)).toMatchObject({
      provider: CREATED.provider,
      validUntil: '2028-10-01',
    })
    expect(completions.find(c => c.externalId === bare.externalId)).toMatchObject({
      provider: null,
      validUntil: null,
    })
    expect(await listProviders(options)).toContain(CREATED.provider)
  })
})

describe('bookings the main suite does not reach', () => {
  const opts = { ...options, now }
  const manual = (sessionExternalId: string, employeeExternalId: string) => ({
    sessionExternalId,
    employeeExternalId,
    source: 'MANUAL' as const,
  })

  it('refuses unknown sessions and people, people who left, and full sessions', async () => {
    const left = await db.employee.findFirstOrThrow({ where: { status: 'TERMINATED' } })
    const outcomes = await applyAssignments(
      [
        manual('T999', 'E0153'),
        manual('T018', 'E9999'),
        manual('T018', left.externalId),
        manual('T023', 'E0153'),
      ],
      'user_test',
      opts
    )
    expect(outcomes.map(o => (o.ok ? 'ok' : o.reason))).toEqual([
      'SESSION_NOT_FOUND',
      'EMPLOYEE_NOT_FOUND',
      'INACTIVE',
      'SESSION_FULL',
    ])
  })

  it('refuses an advisor booking for a training the person is not required to hold', async () => {
    const lead = await db.courseRequirement.findFirstOrThrow({
      where: { course: { code: 'LEAD' } },
      select: { positionId: true },
    })
    const other = await db.employee.findFirstOrThrow({
      where: { status: 'ACTIVE', NOT: { positionId: lead.positionId } },
      orderBy: { externalId: 'asc' },
    })
    const [outcome] = await applyAssignments(
      [{ sessionExternalId: 'T034', employeeExternalId: other.externalId, source: 'ADVISOR' }],
      'user_test',
      opts
    )
    expect(outcome).toMatchObject({ ok: false, reason: 'NOT_REQUIRED' })
  })

  it("lists a person's upcoming bookings, soonest first", async () => {
    await applyAssignments([manual('T018', 'E0153'), manual('T020', 'E0153')], 'user_test', opts)
    const bookings = await listEmployeeBookings('E0153', opts)
    expect(bookings.map(b => [b.sessionExternalId, b.courseCode, b.source])).toEqual([
      ['T020', 'GDPR', 'MANUAL'],
      ['T018', 'BOZP-Z', 'MANUAL'],
    ])
    // Without an explicit clock, "upcoming" is relative to now; the 2027 session still is.
    expect((await listEmployeeBookings('E0153', options)).map(b => b.sessionExternalId)).toContain(
      'T018'
    )
    expect(await removeAssignment('T018', 'E0153', options)).toBe(true)
    expect(await removeAssignment('T018', 'E0153', options)).toBe(false)
    await removeAssignment('T020', 'E0153', options)
  })

  it('uses the real clock when none is given', async () => {
    const [outcome] = await applyAssignments([manual('T999', 'E0153')], 'user_test', options)
    expect(outcome).toMatchObject({ reason: 'SESSION_NOT_FOUND' })
    expect(await moveSeats('T016', 'T999', 1, options)).toEqual({
      ok: false,
      reason: 'SESSION_NOT_FOUND',
    })
    expect((await getAdvisorInput(options)).asOf).toBe(asOf)
  })

  it('refuses seat moves that make no sense', async () => {
    const reasons = await Promise.all([
      moveSeats('T016', 'T016', 1, { ...options, now }),
      moveSeats('T016', 'T999', 1, { ...options, now }),
      moveSeats('T016', 'T020', 1, { ...options, now }),
      moveSeats('T016', 'T017', 1, { ...options, now }),
      // T019 took place in September.
      moveSeats('T016', 'T019', 1, { ...options, now }),
    ])
    expect(reasons.map(r => (r.ok ? 'ok' : r.reason))).toEqual([
      'SAME_SESSION',
      'SESSION_NOT_FOUND',
      'DIFFERENT_COURSE',
      'NOT_PLANNED',
      'PAST',
    ])
  })
})

describe('sessions', () => {
  it('lists past sessions newest first, with a limit', async () => {
    const past = await listSessions({ window: 'past', limit: 3 }, options)
    expect(past).toHaveLength(3)
    expect(past.map(s => s.startsAt)).toEqual(
      past
        .map(s => s.startsAt)
        .toSorted()
        .toReversed()
    )
    expect(await getSession('T999', options)).toBeNull()
    // T029 has no price in the export.
    expect((await getSession('T029', options))?.pricePerPerson).toBeNull()
  })
})

describe('the writer refuses what it should never write', () => {
  it('re-validates every record and names the first bad one', async () => {
    const error = await commitChunk(db, 'courses', [
      { code: 'OK', name: 'Platný', validityMonths: null, requirements: [] },
      { code: 'bad code', name: '', validityMonths: 0, requirements: [] },
    ]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CommitValidationError)
    expect(error).toMatchObject({ index: 1 })
  })

  it('caps the chunk size', async () => {
    const tooMany = Array.from({ length: COMMIT_CHUNK_SIZE + 1 }, () => ({}))
    await expect(commitChunk(db, 'courses', tooMany)).rejects.toThrow(
      `At most ${String(COMMIT_CHUNK_SIZE)} records per chunk`
    )
  })

  it('refuses a completion for a course that does not exist', async () => {
    await expect(
      commitChunk(db, 'completions', [
        {
          externalId: 'Z999999',
          employeeExternalId: 'E0153',
          courseCode: 'NOPE',
          completedOn: '2026-01-01',
          validUntil: null,
          provider: null,
          price: null,
          note: null,
        },
      ])
    ).rejects.toThrow('Unknown course "NOPE"')
  })

  it('writes a course with no requirements and position requirements', async () => {
    const result = await commitChunk(db, 'courses', [
      { code: 'TEST-A', name: 'Zkušební kurz', validityMonths: null, requirements: [] },
      {
        code: 'TEST-B',
        name: 'Zkušební kurz pro vedoucí',
        validityMonths: 12,
        requirements: [{ scope: 'POSITION', position: CREATED.position }],
      },
    ])
    expect(result).toEqual({ created: 2, updated: 0 })
  })
})

describe('seeding a directory', () => {
  it('skips files it cannot recognise and datasets that are absent', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'muni-seed-'))
    try {
      writeFileSync(path.join(dir, 'psi.csv'), 'jmeno_psa,plemeno\nRex,ovčák\n')
      writeFileSync(path.join(dir, 'readme.txt'), 'not a csv')
      writeFileSync(
        path.join(dir, 'katalog.csv'),
        'kod,nazev,platnost_mesicu,povinne_pro\nANGL,Anglický jazyk – kurz,,NEPOVINNE\n'
      )
      const results = await seedFromDirectory(db, dir, asOf)
      expect(results).toEqual({ courses: { created: 0, updated: 1, skipped: 0 } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('settings from the environment', () => {
  it('reads the expiring window, falling back to 30 days on anything but a positive whole number', () => {
    vi.stubEnv('MUNI_EXPIRING_DAYS', '45')
    expect(complianceOptions(asOf)).toEqual({ asOf, expiringWithinDays: 45 })
    for (const value of ['abc', '-5', '7.5']) {
      vi.stubEnv('MUNI_EXPIRING_DAYS', value)
      expect(complianceOptions(asOf).expiringWithinDays).toBe(30)
    }
    vi.unstubAllEnvs()
  })
})

describe('the client', () => {
  it('needs a connection string', () => {
    expect(() => createDb('')).toThrow('DATABASE_URL is not set')
  })

  it('shares one lazy client per process', async () => {
    const client = getDb()
    expect(getDb()).toBe(client)
    expect(dbOf()).toBe(client)
    await client.$disconnect()
  })
})
