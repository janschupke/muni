import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { roomMismatch } from '@muni/domain/rooms'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { deleteCourses, deleteRooms, unarchiveAll } from '../test/archive'
import { createTestUser, deleteTestUser, TEST_USER } from '../test/users'
import { createDb, getDb } from './client'
import {
  applyAssignments,
  createCompletion,
  createCourse,
  createRoom,
  createSession,
  createSessionWithBookings,
  getAdvisorInput,
  getCourse,
  getCourseForEdit,
  getEmployee,
  getEmployeeForEdit,
  getRoom,
  getSession,
  listCourseOptions,
  listDepartments,
  listEmployeeBookings,
  listEmployees,
  listPositions,
  listProviderOptions,
  listRoomOptions,
  listRooms,
  listSessions,
  moveSeatsMany,
  raiseCapacity,
  removeAssignment,
  savePosition,
  updateCourse,
  updateEmployee,
  updateRoom,
  updateSession,
} from './repositories'
import { complianceOptions, dbOf } from './repositories/context'
import { seedFromDirectory } from './seed'
import { COMMIT_CHUNK_SIZE, commitChunk, CommitRefusedError, CommitValidationError } from './writer'

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
  room: 'Zkušební místnost',
  importedRoom: 'Posluchárna 9',
  derivedRoom: 'Venkovní hřiště',
} as const
const CREATED_ROOMS = [CREATED.room, CREATED.importedRoom, CREATED.derivedRoom]

const restore = async () => {
  await db.sessionAssignment.deleteMany()
  await db.courseCompletion.deleteMany({ where: { externalId: { startsWith: 'A' } } })
  await db.courseSession.deleteMany({ where: { room: { name: { in: CREATED_ROOMS } } } })
  await db.courseSession.deleteMany({ where: { externalId: { startsWith: 'S' } } })
  await deleteCourses(db, { code: { startsWith: 'TEST-' } })
  await deleteRooms(db, CREATED_ROOMS)
  await unarchiveAll(db)
  // Needs set by hand are overrides imports never touch; clear them, and the derived ones, so
  // the seed derives them afresh.
  await db.courseCapability.deleteMany()
  await db.course.updateMany({
    data: {
      sessionMinutes: null,
      groupSize: null,
      onlineAllowed: false,
      sessionMinutesOverride: null,
      groupSizeOverride: null,
      onlineAllowedOverride: null,
    },
  })
  await seedFromDirectory(db, DATA_DIR, asOf)
  await db.departmentPosition.deleteMany({
    where: {
      OR: [{ department: { name: CREATED.department } }, { position: { name: CREATED.position } }],
    },
  })
  await db.department.deleteMany({ where: { name: CREATED.department } })
  await db.provider.deleteMany({ where: { name: CREATED.provider } })
  await db.position.deleteMany({ where: { name: CREATED.position } })
}

beforeAll(async () => {
  await restore()
  await createTestUser(db)
})
afterAll(async () => {
  await restore()
  await deleteTestUser(db)
  await db.$disconnect()
})

describe('lookups and edit loaders', () => {
  it('lists departments, positions and providers in name order', async () => {
    for (const list of [
      await listDepartments(options),
      await listPositions(options),
      (await listProviderOptions(options)).map(p => p.name),
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
      requiredForAll: true,
      departmentIds: [],
      positionIds: [],
      // Nothing set in the app: the form's fields are empty, what the sessions say beside them.
      sessionMinutes: null,
      groupSize: null,
      onlineAllowed: null,
      derived: { sessionMinutes: 180, groupSize: 30, onlineAllowed: false },
      capabilities: [],
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
    expect(await getEmployee('E9999', 'VIEWER', options)).toBeNull()
  })

  it('finds people by name, ignoring case and diacritics', async () => {
    const page = await listEmployees({ q: 'cerna' }, options)
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every(e => /čern/i.test(`${e.lastName} ${e.firstName}`))).toBe(true)
  })
})

/** A course's current audience, so an edit of something else leaves it as it is. */
async function audienceOf(code: string) {
  const course = await getCourseForEdit(code, options)
  if (!course) throw new Error(`fixture: ${code} missing`)
  const { requiredForAll, departmentIds, positionIds } = course
  return { requiredForAll, departmentIds, positionIds }
}

describe('edits', () => {
  it('renames a course and sets what its sessions need', async () => {
    const needs = {
      sessionMinutes: 90,
      groupSize: 12,
      onlineAllowed: true,
      capabilities: ['PROJECTOR', 'VIDEO_CONFERENCE'] as const,
    }
    const audience = await audienceOf('ANGL')
    await updateCourse(
      'ANGL',
      {
        name: 'Angličtina pro pokročilé',
        validityMonths: 12,
        ...audience,
        ...needs,
        capabilities: [...needs.capabilities],
      },
      options
    )
    expect(await getCourseForEdit('ANGL', options)).toMatchObject({
      code: 'ANGL',
      name: 'Angličtina pro pokročilé',
      validityMonths: 12,
      requiredForAll: false,
      departmentIds: [],
      positionIds: [],
      ...needs,
      capabilities: ['PROJECTOR', 'VIDEO_CONFERENCE'],
    })
    // Setting it again replaces the list.
    await updateCourse(
      'ANGL',
      {
        name: 'Angličtina pro pokročilé',
        validityMonths: 12,
        ...audience,
        ...needs,
        capabilities: [],
      },
      options
    )
    expect((await getCourseForEdit('ANGL', options))?.capabilities).toEqual([])
    expect(await getCourseForEdit('NOPE', options)).toBeNull()
  })

  it('edits a person: department, no position, leaving date, note', async () => {
    const before = await getEmployeeForEdit('E0153', options)
    if (!before) throw new Error('fixture: E0153 missing')
    const department = await db.department.create({ data: { name: CREATED.department } })
    expect(
      await updateEmployee(
        'E0153',
        {
          ...before,
          departmentId: department.id,
          positionId: null,
          leftOn: '2026-12-31',
          note: '  odchází  ',
        },
        options
      )
    ).toEqual({ ok: true, externalId: 'E0153' })
    expect(await getEmployeeForEdit('E0153', options)).toMatchObject({
      departmentId: department.id,
      positionId: null,
      leftOn: '2026-12-31',
      note: 'odchází',
    })
    expect(await listDepartments(options)).toContain(CREATED.department)
  })

  it('sets a position and clears the leaving date', async () => {
    const before = await getEmployeeForEdit('E0153', options)
    if (!before) throw new Error('fixture: E0153 missing')
    // The position exists in the person's department (a pair), or they cannot hold it.
    const position = await savePosition(
      null,
      { name: CREATED.position, departmentIds: [before.departmentId ?? ''] },
      options
    )
    if (!position.ok) throw new Error('no position')
    expect(
      await updateEmployee('E0153', { ...before, positionId: position.id, leftOn: null }, options)
    ).toEqual({ ok: true, externalId: 'E0153' })
    expect(await getEmployeeForEdit('E0153', options)).toMatchObject({
      positionId: position.id,
      leftOn: null,
    })
  })

  it('records completions entered in the app, with a new provider and without one', async () => {
    const employeeId = (await db.employee.findFirstOrThrow({ where: { externalId: 'E0153' } })).id
    const courseId = async (code: string) =>
      (await db.course.findFirstOrThrow({ where: { code, archivedAt: null } })).id
    const withProvider = await createCompletion(
      {
        employeeId,
        courseId: await courseId('GDPR'),
        completedOn: '2026-10-01',
        validUntil: '2028-10-01',
        providerId: null,
        newProviderName: CREATED.provider,
        price: 600,
        note: null,
      },
      options
    )
    const bare = await createCompletion(
      {
        employeeId,
        courseId: await courseId('LEAD'),
        completedOn: '2026-10-02',
        validUntil: null,
        providerId: null,
        newProviderName: null,
        price: null,
        note: null,
      },
      options
    )
    expect([withProvider, bare]).toEqual([
      { ok: true, employeeExternalId: 'E0153' },
      { ok: true, employeeExternalId: 'E0153' },
    ])
    const completions = (await getEmployee('E0153', 'FULL', options))?.completions ?? []
    const made = completions.find(c => c.courseCode === 'GDPR' && c.completedOn === '2026-10-01')
    expect(made?.externalId).toMatch(/^A[0-9A-Z]+$/)
    expect(made).toMatchObject({ provider: { name: CREATED.provider }, validUntil: '2028-10-01' })
    expect(
      completions.find(c => c.courseCode === 'LEAD' && c.completedOn === '2026-10-02')
    ).toMatchObject({ provider: null, validUntil: null })
    expect((await listProviderOptions(options)).map(p => p.name)).toContain(CREATED.provider)
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
    const left = await db.employee.findFirstOrThrow({ where: { leftOn: { lte: now } } })
    const outcomes = await applyAssignments(
      [
        manual('T999', 'E0153'),
        manual('T018', 'E9999'),
        manual('T018', left.externalId),
        manual('T023', 'E0153'),
      ],
      TEST_USER,
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
    const lead = await db.coursePositionRequirement.findFirstOrThrow({
      where: { course: { code: 'LEAD' } },
      select: { positionId: true },
    })
    const other = await db.employee.findFirstOrThrow({
      where: { status: 'ACTIVE', leftOn: null, NOT: { positionId: lead.positionId } },
      orderBy: { externalId: 'asc' },
    })
    const [outcome] = await applyAssignments(
      [{ sessionExternalId: 'T034', employeeExternalId: other.externalId, source: 'ADVISOR' }],
      TEST_USER,
      opts
    )
    expect(outcome).toMatchObject({ ok: false, reason: 'NOT_REQUIRED' })
  })

  it("lists a person's upcoming bookings, soonest first", async () => {
    await applyAssignments([manual('T018', 'E0153'), manual('T020', 'E0153')], TEST_USER, opts)
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
    const [outcome] = await applyAssignments([manual('T999', 'E0153')], TEST_USER, options)
    expect(outcome).toMatchObject({ reason: 'SESSION_NOT_FOUND' })
    expect(await moveSeatsMany('T016', [{ to: 'T999', count: 1 }], options)).toEqual({
      ok: false,
      reason: 'SESSION_NOT_FOUND',
      to: 'T999',
    })
    expect((await getAdvisorInput(options)).asOf).toBe(asOf)
  })

  it('refuses seat moves that make no sense', async () => {
    const move = (to: string, count = 1) =>
      moveSeatsMany('T016', [{ to, count }], { ...options, now })
    const reasons = await Promise.all([
      move('T016'),
      move('T999'),
      move('T020'),
      move('T017'),
      // T019 took place in September.
      move('T019'),
      move('T018', 0),
      moveSeatsMany('T999', [{ to: 'T018', count: 1 }], { ...options, now }),
      // Nor out of a session that is cancelled or over: those seats are history.
      moveSeatsMany('T017', [{ to: 'T018', count: 1 }], { ...options, now }),
      moveSeatsMany('T019', [{ to: 'T018', count: 1 }], { ...options, now }),
    ])
    expect(reasons.map(r => (r.ok ? 'ok' : r.reason))).toEqual([
      'SAME_SESSION',
      'SESSION_NOT_FOUND',
      'DIFFERENT_COURSE',
      'NOT_PLANNED',
      'PAST',
      'NOT_ENOUGH_UNNAMED',
      'SESSION_NOT_FOUND',
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

describe('rooms', () => {
  const room = {
    name: CREATED.room,
    kind: 'LAB' as const,
    capacity: 16,
    capabilities: ['LAB_EQUIPMENT' as const],
    note: null,
  }

  it('creates, edits and lists a room, and deletes it only while nothing is held there', async () => {
    const { id } = await createRoom(room, options)
    const labBez = await db.course.findFirstOrThrow({
      where: { code: 'LAB-BEZ', archivedAt: null },
    })
    // A course needing lab equipment and a projector; this room has the first only (for now).
    // (LAB-BEZ itself cannot be made to need a projector: its planned rooms have none.)
    expect(
      await createCourse(
        {
          code: 'TEST-ROOM',
          name: 'Laboratorní kurz',
          validityMonths: null,
          requiredForAll: false,
          departmentIds: [],
          positionIds: [],
          sessionMinutes: 240,
          groupSize: 16,
          onlineAllowed: false,
          capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
        },
        options
      )
    ).toEqual({ ok: true, code: 'TEST-ROOM' })
    expect(
      await updateCourse(
        'LAB-BEZ',
        {
          ...(await audienceOf('LAB-BEZ')),
          name: 'Bezpečná práce v laboratoři',
          validityMonths: 12,
          sessionMinutes: null,
          groupSize: null,
          onlineAllowed: null,
          capabilities: ['LAB_EQUIPMENT', 'PROJECTOR', 'COMPUTERS'],
        },
        options
      )
    ).toMatchObject({ ok: false, reason: 'sessions_unfit' })
    expect(
      (await getRoom(id, { ...options, now }))?.courses.find(c => c.code === 'TEST-ROOM')?.fit
        .mismatch
    ).toEqual({ kind: 'MISSING_CAPABILITIES', missing: ['PROJECTOR'] })
    await updateRoom(
      id,
      { ...room, capacity: 18, capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'], note: ' 2. patro ' },
      options
    )
    const saved = await db.room.findUniqueOrThrow({
      where: { id },
      include: { capabilities: { orderBy: { capability: 'asc' } } },
    })
    expect([saved.capacity, saved.note, saved.capabilities.map(c => c.capability)]).toEqual([
      18,
      '2. patro',
      // In the enum's order.
      ['PROJECTOR', 'LAB_EQUIPMENT'],
    ])
    expect(
      (await getRoom(id, { ...options, now }))?.courses.find(c => c.code === 'TEST-ROOM')?.fit
        .mismatch
    ).toBeNull()
    expect((await listRooms({ ...options, now })).find(r => r.id === id)?.capabilities).toEqual([
      'PROJECTOR',
      'LAB_EQUIPMENT',
    ])
    const rooms = await listRoomOptions(options)
    expect(rooms.find(r => r.id === id)).toEqual({
      id,
      name: CREATED.room,
      kind: 'LAB',
      capacity: 18,
      capabilities: ['PROJECTOR', 'LAB_EQUIPMENT'],
    })
    expect(rooms.map(r => r.name)).toEqual(rooms.map(r => r.name).toSorted())

    const create = {
      courseId: labBez.id,
      date: '2027-03-03',
      startTime: '09:00',
      endTime: '13:00',
      roomId: id,
      capacity: 16,
      pricePerPerson: 1500,
      status: 'PLANNED' as const,
    }
    // The app's own numbering, which imports refuse, so an export never overwrites it.
    expect(await createSession(create, options)).toEqual({
      ok: true,
      externalId: 'S001',
      courseCode: 'LAB-BEZ',
    })
    expect(await getSession('S001', options)).toMatchObject({
      startsAt: '2027-03-03T08:00:00.000Z',
      room: { id, name: CREATED.room, kind: 'LAB' },
      bookedCount: 0,
    })
    // The room is taken then, unless the clash is cancelled; it seats 18, and it is not online.
    const overlapping = { ...create, startTime: '12:00', endTime: '15:00' }
    expect(await createSession(overlapping, options)).toEqual({ ok: false, problem: 'ROOM_BUSY' })
    expect(await createSession({ ...overlapping, status: 'CANCELLED' }, options)).toMatchObject({
      ok: true,
      externalId: 'S002',
    })
    expect(await createSession({ ...create, date: '2027-03-04', capacity: 20 }, options)).toEqual({
      ok: false,
      problem: 'ROOM_TOO_SMALL',
    })
    const online = await db.room.findFirstOrThrow({ where: { kind: 'ONLINE' } })
    expect(await createSession({ ...create, roomId: online.id }, options)).toEqual({
      ok: false,
      problem: 'ROOM_ONLINE_NOT_ALLOWED',
    })
    // Saving a session never clashes with itself; moving it onto another one does.
    const edit = { ...create, unnamedBookings: 2 }
    expect(await updateSession('S001', edit, options)).toEqual({
      ok: true,
      externalId: 'S001',
      courseCode: 'LAB-BEZ',
    })
    expect(await updateSession('S002', { ...edit, status: 'PLANNED' }, options)).toEqual({
      ok: false,
      problem: 'ROOM_BUSY',
    })
  })

  it('refuses to move a session onto a time its booked people are elsewhere', async () => {
    // S001: CREATED.room, 2027-03-03 09:00-13:00. A second session on another day, then one
    // person booked on both.
    const first = await getSession('S001', options)
    if (!first) throw new Error('no S001')
    const later = {
      courseId: first.courseId,
      date: '2027-03-10',
      startTime: '09:00',
      endTime: '10:00',
      roomId: first.room.id,
      capacity: 5,
      pricePerPerson: null,
      status: 'PLANNED' as const,
    }
    const created = await createSession(later, options)
    if (!created.ok) throw new Error('second session refused')
    const booked = await applyAssignments(
      ['S001', created.externalId].map(sessionExternalId => ({
        sessionExternalId,
        employeeExternalId: 'E0153',
        source: 'MANUAL' as const,
      })),
      TEST_USER,
      { ...options, now }
    )
    expect(booked.map(b => b.ok)).toEqual([true, true])
    // Another room that suits the course is free then; but E0153 is at S001.
    const needs = (await listCourseOptions(options)).find(c => c.id === first.courseId)?.needs
    const other = (await listRoomOptions(options)).find(
      r => r.id !== first.room.id && needs && roomMismatch(r, needs, 5) === null
    )
    if (!other) throw new Error('no other room for the course')
    const onto = { ...later, date: '2027-03-03', startTime: '12:00', endTime: '13:00' }
    expect(
      await updateSession(
        created.externalId,
        { ...onto, roomId: other.id, unnamedBookings: 0 },
        options
      )
    ).toEqual({ ok: false, problem: 'ATTENDEE_CONFLICT' })
    // Cancelled, it holds nobody anywhere.
    expect(
      await updateSession(
        created.externalId,
        { ...onto, status: 'CANCELLED', unnamedBookings: 0 },
        options
      )
    ).toMatchObject({ ok: true })
    await db.sessionAssignment.deleteMany({ where: { employee: { externalId: 'E0153' } } })
  })

  it('imports rooms and creates the ones only sessions name', async () => {
    expect(
      await commitChunk(db, 'rooms', [
        {
          name: CREATED.importedRoom,
          kind: 'CLASSROOM',
          capacity: 60,
          capabilities: ['PROJECTOR', 'WHEELCHAIR_ACCESS'],
          note: null,
        },
      ])
    ).toEqual({ created: 1, updated: 0, skipped: 0 })
    expect(
      await commitChunk(db, 'rooms', [
        {
          name: CREATED.importedRoom,
          kind: 'CLASSROOM',
          capacity: 80,
          capabilities: [],
          note: null,
        },
      ])
    ).toEqual({ created: 0, updated: 1, skipped: 0 })
    const imported = await db.room.findUniqueOrThrow({
      where: { name: CREATED.importedRoom },
      include: { capabilities: true },
    })
    expect([imported.capacity, imported.capabilities]).toEqual([80, []])

    const session = (externalId: string, capacity: number) => ({
      externalId,
      courseCode: 'POZ-OCH',
      date: '2027-04-07',
      startTime: '10:00',
      endTime: '12:00',
      location: CREATED.derivedRoom,
      capacity,
      bookedCount: 0,
      pricePerPerson: null,
      status: 'PLANNED',
    })
    // POZ-OCH's needs were never set by hand: they follow its sessions, the new ones included.
    await commitChunk(db, 'sessions', [session('T901', 25), session('T902', 35)])
    expect(
      await db.course.findUniqueOrThrow({
        where: { code: 'POZ-OCH' },
        select: { sessionMinutes: true, groupSize: true, onlineAllowed: true },
      })
    ).toEqual({ sessionMinutes: 120, groupSize: 35, onlineAllowed: false })
    expect(
      await db.room.findUniqueOrThrow({
        where: { name: CREATED.derivedRoom },
        select: { kind: true, capacity: true },
      })
    ).toEqual({ kind: 'OUTDOOR', capacity: 35 })

    // Set by hand, they are overrides the next import leaves alone (it derives its own).
    await updateCourse(
      'POZ-OCH',
      {
        ...(await audienceOf('POZ-OCH')),
        name: 'Požární ochrana',
        validityMonths: 24,
        sessionMinutes: 90,
        groupSize: 20,
        onlineAllowed: true,
        capabilities: [],
      },
      options
    )
    await commitChunk(db, 'sessions', [session('T901', 25), session('T902', 35)])
    expect(
      await db.course.findUniqueOrThrow({
        where: { code: 'POZ-OCH' },
        select: {
          sessionMinutesOverride: true,
          groupSizeOverride: true,
          onlineAllowedOverride: true,
        },
      })
    ).toEqual({ sessionMinutesOverride: 90, groupSizeOverride: 20, onlineAllowedOverride: true })

    // A rooms file without an equipment column leaves the equipment as it is.
    await commitChunk(db, 'rooms', [
      {
        name: CREATED.importedRoom,
        kind: 'CLASSROOM',
        capacity: 80,
        capabilities: ['PROJECTOR'],
        note: null,
      },
    ])
    await commitChunk(db, 'rooms', [
      {
        name: CREATED.importedRoom,
        kind: 'CLASSROOM',
        capacity: 90,
        capabilities: null,
        note: null,
      },
    ])
    expect(
      await db.room.findUniqueOrThrow({
        where: { name: CREATED.importedRoom },
        select: { capacity: true, capabilities: { select: { capability: true } } },
      })
    ).toEqual({ capacity: 90, capabilities: [{ capability: 'PROJECTOR' }] })
  })
})

describe('a planned session with the people it is for', () => {
  it('checks without writing, refuses as a whole, then creates and books everyone', async () => {
    const course = (await listCourseOptions(options)).find(c => c.code === 'BOZP-Z')
    if (!course) throw new Error('no BOZP-Z')
    // A room with a seat limit, so raising past it can be refused.
    const room = (await listRoomOptions(options)).find(
      r => r.kind !== 'ONLINE' && r.capacity !== null && roomMismatch(r, course.needs, 10) === null
    )
    if (!room) throw new Error('no room for BOZP-Z')
    const people = (await getAdvisorInput({ ...options, now })).needs
      .filter(n => n.course.code === 'BOZP-Z')
      .slice(0, 2)
      .map(n => n.employee.externalId)
    expect(people).toHaveLength(2)
    const session = {
      courseId: course.id,
      date: '2027-05-04',
      startTime: '13:00',
      endTime: '16:00',
      roomId: room.id,
      capacity: 10,
      pricePerPerson: 450,
      status: 'PLANNED' as const,
    }
    const sessions = () => db.courseSession.count({ where: { externalId: { startsWith: 'S' } } })
    const before = await sessions()

    // A dry run answers as the real one would, and leaves nothing behind.
    const preview = await createSessionWithBookings(session, people, TEST_USER, {
      ...options,
      now,
      dryRun: true,
    })
    expect(preview).toMatchObject({ ok: true, booked: 2, dryRun: true })
    expect(await sessions()).toBe(before)

    // One person who cannot be booked stops all of it.
    expect(
      await createSessionWithBookings(session, [...people, 'E9999'], TEST_USER, {
        ...options,
        now,
      })
    ).toEqual({
      ok: false,
      problem: null,
      refusals: [{ employeeExternalId: 'E9999', reason: 'EMPLOYEE_NOT_FOUND' }],
    })
    expect(await sessions()).toBe(before)
    // So does a session that cannot be saved so.
    expect(
      await createSessionWithBookings({ ...session, capacity: 10_000 }, people, TEST_USER, {
        ...options,
        now,
      })
    ).toMatchObject({ ok: false, problem: 'ROOM_TOO_SMALL' })

    const created = await createSessionWithBookings(session, people, TEST_USER, {
      ...options,
      now,
    })
    expect(created).toMatchObject({ ok: true, booked: 2, dryRun: false })
    if (!created.ok) return
    const saved = await getSession(created.externalId, options)
    expect(saved?.bookedCount).toBe(2)
    expect(saved?.assigned.map(p => (p.archived ? '' : p.externalId)).toSorted()).toEqual(
      people.toSorted()
    )

    // Its capacity can grow while the room has the seats, never shrink this way.
    expect(await raiseCapacity(created.externalId, 12, options)).toEqual({ ok: true })
    expect((await getSession(created.externalId, options))?.capacity).toBe(12)
    expect(await raiseCapacity(created.externalId, 11, options)).toEqual({
      ok: false,
      problem: 'NOT_RAISED',
    })
    expect(await raiseCapacity('T999', 40, options)).toEqual({ ok: false, problem: 'NOT_FOUND' })
    expect(await raiseCapacity(created.externalId, (room.capacity ?? 0) + 1, options)).toEqual({
      ok: false,
      problem: 'ROOM_TOO_SMALL',
    })
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

  it('refuses app IDs, and rooms that app sessions hold or would no longer fit in', async () => {
    // S001 is the app's session in CREATED.room on 2027-03-03, 09:00-13:00 (seats 16).
    const session = {
      externalId: 'S777',
      courseCode: 'LAB-BEZ',
      date: '2027-03-03',
      startTime: '10:00',
      endTime: '11:00',
      location: CREATED.room,
      capacity: 5,
      bookedCount: 0,
      pricePerPerson: null,
      status: 'PLANNED',
    }
    const reserved = await commitChunk(db, 'sessions', [session]).catch((e: unknown) => e)
    expect(reserved).toBeInstanceOf(CommitValidationError)
    expect(reserved).toMatchObject({
      index: 0,
      issues: [{ path: ['externalId'], message: 'RESERVED_ID' }],
    })
    const completion = {
      externalId: 'A12345',
      employeeExternalId: 'E0153',
      courseCode: 'LAB-BEZ',
      completedOn: '2026-01-01',
      validUntil: null,
      provider: null,
      price: null,
      note: null,
    }
    await expect(commitChunk(db, 'completions', [completion])).rejects.toBeInstanceOf(
      CommitValidationError
    )

    // The second record takes the room while S001 holds it: nothing of the chunk is written.
    const busy = await commitChunk(db, 'sessions', [
      { ...session, externalId: 'T950', startTime: '07:00', endTime: '08:00' },
      { ...session, externalId: 'T951' },
    ]).catch((e: unknown) => e)
    expect(busy).toBeInstanceOf(CommitRefusedError)
    expect(busy).toMatchObject({ index: 1, reason: 'ROOM_BUSY', key: 'T951 → S001' })
    expect(await db.courseSession.count({ where: { externalId: { in: ['T950', 'T951'] } } })).toBe(
      0
    )
    // A cancelled one holds nothing.
    expect(
      await commitChunk(db, 'sessions', [{ ...session, externalId: 'T952', status: 'CANCELLED' }])
    ).toEqual({ created: 1, updated: 0, skipped: 0 })

    // Four seats would no longer hold S001's sixteen.
    await expect(
      commitChunk(db, 'rooms', [
        { name: CREATED.room, kind: 'LAB', capacity: 4, capabilities: null, note: null },
      ])
    ).rejects.toMatchObject({ reason: 'ROOM_UNFIT', key: CREATED.room })
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
    expect(result).toEqual({ created: 2, updated: 0, skipped: 0 })
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
