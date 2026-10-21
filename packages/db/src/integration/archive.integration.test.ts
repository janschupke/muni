import { archiveTag } from '@muni/domain/archive'
import {
  archivedCandidates,
  type ImportBatch,
  NO_ARCHIVED,
  parseFile,
  validateBatch,
} from '@muni/importer'
import { afterAll, describe, expect, it } from 'vitest'

import { defaultProviderId, offer } from '../../test/providers'
import { TEST_USER } from '../../test/users'
import { createDb } from '../connect'
import { findArchivedKeys, loadReferenceSnapshot } from '../reference'
import {
  applyAssignments,
  archiveImpact,
  archiveRecord,
  cancelSession,
  createProvider,
  createRoom,
  createSession,
  getAdvisorInput,
  getArchivedRecord,
  getComplianceMatrix,
  getCourse,
  getDashboard,
  getDepartment,
  getEmployee,
  getPersonName,
  getPlannerInput,
  getProvider,
  getSession,
  listArchived,
  listCourseOptions,
  listCourses,
  listDepartmentSummaries,
  listEmployees,
  listProviders,
  listRoomOptions,
  listSessions,
  listUpcomingBookings,
  recordExists,
  unarchiveRecord,
} from '../repositories'
import { loadCompliance } from '../repositories/core/context'
import { commitChunk } from '../writer'

// Archiving: unique keys free for new records, archived records out of every list and count,
// the rules on what may be archived, imports that skip archived records, archived people
// anonymised everywhere but on their own admin page, and no foreign key left that cascades.

const db = createDb()
const asOf = '2026-10-16'
const now = new Date('2026-10-16T12:00:00Z')
const options = { db, asOf, now }

const NAME = 'Archiv test'
const ROOM = `${NAME} místnost`
const ADMIN = 'user_it_archive_admin'

afterAll(async () => {
  await db.$disconnect()
})

const idOf = async (model: 'employee' | 'course' | 'courseSession', key: string) => {
  const where = model === 'course' ? { code: key } : { externalId: key }
  const delegate = db[model] as unknown as {
    findFirstOrThrow(args: object): Promise<{ id: string }>
  }
  return (await delegate.findFirstOrThrow({ where: { ...where, archivedAt: null } })).id
}

const archive = (kind: Parameters<typeof archiveRecord>[0], id: string) =>
  archiveRecord(kind, id, TEST_USER, options)

/** A fresh course with no sessions, people or requirements. */
/** A course two hours long, offered by the default provider (so sessions of it can be made). */
async function fixtureCourse(code: string) {
  const course = await db.course.create({
    data: { code, name: `${NAME} kurz`, sessionMinutes: 120 },
    select: { id: true },
  })
  await offer(db, await defaultProviderId(db), course.id)
  return course
}

const fixtureEmployee = (externalId: string, data: { departmentId?: string } = {}) =>
  db.employee.create({
    data: {
      externalId,
      firstName: 'Test',
      lastName: 'Archivní',
      email: `${externalId.toLowerCase()}@archiv.example`,
      hiredOn: new Date('2020-01-01'),
      status: 'ACTIVE',
      ...data,
    },
    select: { id: true },
  })

const fixtureRoom = async (name = ROOM) => {
  const room = await createRoom(
    { name, kind: 'CLASSROOM', capacity: 20, capabilities: [], note: null },
    options
  )
  return room.id
}

describe('unique keys among active records only', () => {
  it('frees an archived name for a new record, and refuses to bring the old one back', async () => {
    const first = await db.department.create({ data: { name: `${NAME} oddělení` } })
    expect(await archive('department', first.id)).toEqual({ ok: true, removesBookings: 0 })
    const second = await db.department.create({ data: { name: `${NAME} oddělení` } })
    expect(await unarchiveRecord('department', first.id, options)).toEqual({
      ok: false,
      reason: 'TAKEN',
      fields: ['name'],
    })
    // The index itself holds: no second active row of the name.
    await expect(
      db.department.create({ data: { name: `${NAME} oddělení` } })
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(await archive('department', second.id)).toMatchObject({ ok: true })
    expect(await unarchiveRecord('department', first.id, options)).toEqual({ ok: true })
    expect(await unarchiveRecord('department', first.id, options)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    })
  })

  it('does the same for every unique key', async () => {
    const position = await db.position.create({ data: { name: `${NAME} pozice` } })
    const provider = await createProvider(
      {
        name: `${NAME} dodavatel`,
        companyId: '00000060',
        email: null,
        phone: null,
        website: null,
        note: null,
        isDefault: false,
        offerings: [],
      },
      options
    )
    if (!provider.ok) throw new Error('provider not created')
    const course = await fixtureCourse('TEST-ARCH-A')
    const employee = await fixtureEmployee('XA0001')
    const room = await fixtureRoom()
    const session = await db.courseSession.create({
      data: {
        externalId: 'XA-S1',
        courseId: course.id,
        roomId: room,
        providerId: await defaultProviderId(db),
        startsAt: new Date('2026-09-01T08:00:00Z'),
        endsAt: new Date('2026-09-01T10:00:00Z'),
        capacity: 10,
      },
    })
    const completion = await db.courseCompletion.create({
      data: {
        externalId: 'XA-C1',
        employeeId: employee.id,
        courseId: course.id,
        completedOn: new Date('2026-09-01'),
      },
    })
    const user = await db.user.create({
      data: { clerkId: 'user_it_archive_a', syncedAt: new Date() },
    })

    const cases = [
      [
        'position',
        position.id,
        () => db.position.create({ data: { name: `${NAME} pozice` } }),
        ['name'],
      ],
      [
        'provider',
        provider.id,
        () => db.provider.create({ data: { name: `${NAME} dodavatel`, companyId: '00000060' } }),
        ['name', 'companyId'],
      ],
      ['course', course.id, () => fixtureCourse('TEST-ARCH-A'), ['code']],
      ['employee', employee.id, () => fixtureEmployee('XA0001'), ['externalId', 'email']],
      [
        'room',
        room,
        () => db.room.create({ data: { name: ROOM, kind: 'LAB', capacity: 5 } }),
        ['name'],
      ],
      [
        'session',
        session.id,
        () =>
          db.courseSession.create({
            data: {
              externalId: 'XA-S1',
              courseId: course.id,
              roomId: room,
              providerId: session.providerId,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              capacity: 10,
            },
          }),
        ['externalId'],
      ],
      [
        'completion',
        completion.id,
        () =>
          db.courseCompletion.create({
            data: {
              externalId: 'XA-C1',
              employeeId: employee.id,
              courseId: course.id,
              completedOn: completion.completedOn,
            },
          }),
        ['externalId'],
      ],
      [
        'user',
        user.id,
        () => db.user.create({ data: { clerkId: 'user_it_archive_a', syncedAt: new Date() } }),
        ['clerkId'],
      ],
    ] as const
    // Children first: a session or completion comes back only while its parents are active.
    const order = [
      'completion',
      'session',
      'position',
      'provider',
      'user',
      'employee',
      'course',
      'room',
    ]
    for (const kind of order) {
      const [, id, twin, fields] = cases.find(c => c[0] === kind) ?? []
      if (!id || !twin) throw new Error(kind)
      expect(await archive(kind as (typeof cases)[number][0], id), kind).toMatchObject({ ok: true })
      await twin()
      expect(await unarchiveRecord(kind as (typeof cases)[number][0], id, options), kind).toEqual({
        ok: false,
        reason: 'TAKEN',
        fields,
      })
    }
  })

  it('lets exactly one of two archived twins come back at once', async () => {
    const make = async () => {
      const id = await fixtureRoom(`${ROOM} závod`)
      await archive('room', id)
      return id
    }
    const [a, b] = [await make(), await make()]
    const results = await Promise.all([
      unarchiveRecord('room', a, options),
      unarchiveRecord('room', b, options),
    ])
    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok)).toEqual([{ ok: false, reason: 'TAKEN', fields: ['name'] }])
  })
})

describe('archived records leave every list and count', () => {
  it('drops an archived person from the lists, compliance and the advisor, and back', async () => {
    const before = await listEmployees({}, options)
    const id = await idOf('employee', 'E0066')
    expect(await archive('employee', id)).toMatchObject({ ok: true })

    const after = await listEmployees({}, options)
    expect(after.total).toBe(before.total - 1)
    expect((await loadCompliance(options)).employees.some(e => e.id === id)).toBe(false)
    const advisor = await getAdvisorInput(options)
    expect(advisor.needs.some(n => n.employee.externalId === 'E0066')).toBe(false)
    expect(await getEmployee('E0066', 'ADMIN', options)).toBeNull()
    expect(await getPersonName('E0066', options)).toBeNull()

    expect(await unarchiveRecord('employee', id, options)).toEqual({ ok: true })
    expect((await listEmployees({}, options)).total).toBe(before.total)
  })

  it('drops an archived course from the catalogue, and back', async () => {
    const id = await idOf('course', 'ANGL')
    expect(await archive('course', id)).toMatchObject({ ok: true })
    expect((await listCourses(options)).map(c => c.code)).not.toContain('ANGL')
    expect(await getCourse('ANGL', options)).toBeNull()
    // Offered to no form, but kept by a record that has it.
    expect((await listCourseOptions(options)).map(c => c.code)).not.toContain('ANGL')
    expect((await listCourseOptions({ ...options, keep: id })).map(c => c.code)).toContain('ANGL')
    expect(await unarchiveRecord('course', id, options)).toEqual({ ok: true })
    expect((await listCourses(options)).map(c => c.code)).toContain('ANGL')
  })

  it('keeps pointing to an archived room from its past sessions, muted', async () => {
    const course = await fixtureCourse('TEST-ARCH-R')
    const room = await fixtureRoom(`${ROOM} minulá`)
    await db.courseSession.create({
      data: {
        externalId: 'XA-S2',
        courseId: course.id,
        roomId: room,
        providerId: await defaultProviderId(db),
        startsAt: new Date('2026-09-02T08:00:00Z'),
        endsAt: new Date('2026-09-02T10:00:00Z'),
        capacity: 10,
      },
    })
    expect(await archive('room', room)).toMatchObject({ ok: true })
    expect((await listRoomOptions(options)).map(r => r.id)).not.toContain(room)
    expect((await getSession('XA-S2', options))?.room).toMatchObject({ id: room, archived: true })
    // Nothing new is planned there.
    expect(
      await createSession(
        {
          courseId: course.id,
          providerId: await defaultProviderId(db),
          date: '2026-12-01',
          startTime: '08:00',
          capacity: 5,
          roomId: room,
        },
        options
      )
    ).toEqual({ ok: false, problem: 'ROOM_ARCHIVED' })
  })
})

describe('what may be archived', () => {
  it('refuses what is still in use, saying how much', async () => {
    expect(
      await archiveImpact(
        'room',
        (await db.room.findFirstOrThrow({ where: { name: 'Aula A' } })).id,
        options
      )
    ).toEqual({
      ok: false,
      reason: 'IN_USE',
      count: 6,
    })
    expect(await archiveImpact('course', await idOf('course', 'BOZP-Z'), options)).toEqual({
      ok: false,
      reason: 'HAS_UPCOMING_SESSIONS',
      count: 2,
    })
    // A session still to start is cancelled, not archived, with seats taken or not.
    expect(await archiveImpact('session', await idOf('courseSession', 'T003'), options)).toEqual({
      ok: false,
      reason: 'UPCOMING',
      count: 5,
    })
    const lab = await db.department.findFirstOrThrow({ where: { name: 'Laboratoře' } })
    expect(await archiveImpact('department', lab.id, options)).toEqual({
      ok: false,
      reason: 'IN_USE',
      count: 33,
    })
    // A refusal writes nothing.
    expect(await archive('department', lab.id)).toMatchObject({ ok: false, reason: 'IN_USE' })
    expect(await db.department.count({ where: { id: lab.id, archivedAt: null } })).toBe(1)
    expect(await archiveImpact('provider', 'nope', options)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
      count: 0,
    })
  })

  it("removes a person's future bookings with them, and keeps their past ones", async () => {
    const employee = await fixtureEmployee('XA0002')
    const past = await idOf('courseSession', 'T001')
    await db.sessionAssignment.create({
      data: { sessionId: past, employeeId: employee.id, createdById: TEST_USER },
    })
    const [future] = await applyAssignments(
      [{ sessionExternalId: 'T020', employeeExternalId: 'XA0002', source: 'MANUAL' }],
      TEST_USER,
      options
    )
    expect(future).toMatchObject({ ok: true })
    expect(await archiveImpact('employee', employee.id, options)).toEqual({
      ok: true,
      removesBookings: 1,
    })
    expect(await archive('employee', employee.id)).toEqual({ ok: true, removesBookings: 1 })
    expect(
      await db.sessionAssignment.findMany({
        where: { employeeId: employee.id },
        select: { sessionId: true },
      })
    ).toEqual([{ sessionId: past }])
    // Archived people take no seats.
    const [refused] = await applyAssignments(
      [{ sessionExternalId: 'T020', employeeExternalId: 'XA0002', source: 'MANUAL' }],
      TEST_USER,
      options
    )
    expect(refused).toMatchObject({ ok: false, reason: 'EMPLOYEE_NOT_FOUND' })
  })

  it('brings nothing back into an archived parent', async () => {
    const department = await db.department.create({ data: { name: `${NAME} útvar` } })
    const employee = await fixtureEmployee('XA0003', { departmentId: department.id })
    expect(await archive('department', department.id)).toMatchObject({ reason: 'IN_USE', count: 1 })
    expect(await archive('employee', employee.id)).toMatchObject({ ok: true })
    expect(await archive('department', department.id)).toMatchObject({ ok: true })
    expect(await unarchiveRecord('employee', employee.id, options)).toEqual({
      ok: false,
      reason: 'PARENT_ARCHIVED',
    })
    expect(await unarchiveRecord('department', department.id, options)).toEqual({ ok: true })
    expect(await unarchiveRecord('employee', employee.id, options)).toEqual({ ok: true })
  })

  it('brings no session back into a room that another one now holds', async () => {
    const roomId = await fixtureRoom(`${ROOM} termín`)
    const course = await fixtureCourse('TEST-ARCH-SLOT')
    const slot = {
      courseId: course.id,
      providerId: await defaultProviderId(db),
      date: '2027-06-01',
      startTime: '10:00',
      roomId,
      capacity: 10,
    }
    const first = await createSession(slot, options)
    if (!first.ok) throw new Error('first session refused')
    const firstId = await idOf('courseSession', first.externalId)
    // Planned and still to start, it is cancelled, never archived; one archived before that
    // rule (or under way) can still come back while planned, so the check stays.
    expect(await archive('session', firstId)).toEqual({ ok: false, reason: 'UPCOMING', count: 0 })
    await db.courseSession.update({
      where: { id: firstId },
      data: { archivedAt: now, archivedById: TEST_USER },
    })
    // Its slot is free again, and another session takes it.
    const second = await createSession(slot, options)
    if (!second.ok) throw new Error('second session refused')
    expect(await unarchiveRecord('session', firstId, options)).toEqual({
      ok: false,
      reason: 'SESSION',
      problem: 'ROOM_BUSY',
    })
    // Cancelled, the second holds the room no more, and is archived.
    expect(await cancelSession(second.externalId, options)).toMatchObject({ ok: true })
    expect(await archive('session', await idOf('courseSession', second.externalId))).toMatchObject({
      ok: true,
    })
    expect(await unarchiveRecord('session', firstId, options)).toEqual({ ok: true })
  })

  it('keeps an admin from archiving themselves or the last admin', async () => {
    expect(await archive('user', TEST_USER)).toEqual({ ok: false, reason: 'SELF', count: 0 })
    // Only this admin is active while the check runs.
    await db.user.updateMany({
      where: { role: 'ADMIN', archivedAt: null },
      data: { archivedAt: now, archivedById: TEST_USER },
    })
    const admin = await db.user.create({
      data: { clerkId: ADMIN, role: 'ADMIN', syncedAt: new Date() },
    })
    expect(await archive('user', admin.id)).toEqual({ ok: false, reason: 'LAST_ADMIN', count: 0 })
    await db.user.update({ where: { id: TEST_USER }, data: { role: 'ADMIN' } })
    expect(await archive('user', admin.id)).toMatchObject({ ok: true })
    await db.user.update({ where: { id: TEST_USER }, data: { role: 'VIEWER' } })
  })
})

describe('imports skip archived records', () => {
  const record = {
    externalId: 'E0066',
    firstName: 'Někdo',
    lastName: 'Jiný',
    email: null,
    nationalId: null,
    department: null,
    position: null,
    managerEmail: null,
    hiredOn: '2020-01-01',
    leftOn: null,
    status: 'ACTIVE',
    note: null,
  }

  it('leaves an archived person alone, and anything that names them', async () => {
    const id = await idOf('employee', 'E0066')
    expect(await archive('employee', id)).toMatchObject({ ok: true })
    const stored = await db.employee.findUniqueOrThrow({ where: { id } })

    expect(await commitChunk(db, 'employees', [record], { last: true })).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 1,
    })
    expect(await db.employee.findUniqueOrThrow({ where: { id } })).toEqual(stored)
    expect(await db.employee.count({ where: { externalId: 'E0066' } })).toBe(1)

    const completion = {
      externalId: 'X900001',
      employeeExternalId: 'E0066',
      courseCode: 'BOZP-Z',
      completedOn: '2026-10-01',
      validUntil: null,
      provider: null,
      price: null,
      note: null,
    }
    expect(await commitChunk(db, 'completions', [completion], { last: true })).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 1,
    })

    // The review says so before anything is sent.
    const snapshot = await loadReferenceSnapshot(db)
    expect(snapshot.employees.some(e => e.externalId === 'E0066')).toBe(false)
    const rows = parseFile(
      'zamestnanci.csv',
      new TextEncoder().encode(
        'id_zamestnance,jmeno,prijmeni,email,utvar,pozice,vedouci_email,datum_nastupu,stav\nE0066,Někdo,Jiný,,,,,2020-01-01,aktivní'
      ),
      { today: asOf }
    ).rows
    const batch = { employees: rows as NonNullable<ImportBatch['employees']> }
    // The server says which of the batch's own keys are archived, and only those.
    const archived = await findArchivedKeys(db, archivedCandidates(batch))
    expect(archived).toEqual({ ...NO_ARCHIVED, employees: ['E0066'] })
    const [row] = validateBatch(batch, { ...snapshot, archived }).employees ?? []
    expect(row).toMatchObject({ isValid: true, isSkipped: true })
    expect(row?.warnings.map(w => w.code)).toContain('ARCHIVED')

    expect(await unarchiveRecord('employee', id, options)).toEqual({ ok: true })
  })
})

describe('archived people are anonymised everywhere but on their own admin page', () => {
  const FIRST = 'Zzsentinelfirst'
  const LAST = 'Zzsentinellast'
  const EMAIL = 'zz.sentinel@archiv.example'
  const ID = 'E0044'

  it('never shows an archived person, to any role, in any read', async () => {
    // E0044 manages people, reports to someone, and has completions by named providers.
    const id = await idOf('employee', ID)
    await db.employee.update({
      where: { id },
      data: { firstName: FIRST, lastName: LAST, email: EMAIL },
    })
    const past = await idOf('courseSession', 'T001')
    await db.sessionAssignment.create({
      data: { sessionId: past, employeeId: id, createdById: TEST_USER },
    })
    expect(await archive('employee', id)).toMatchObject({ ok: true })

    const report = await db.employee.findFirstOrThrow({
      where: { managerId: id, archivedAt: null },
      select: { externalId: true },
    })
    const manager = await db.employee.findFirstOrThrow({
      where: { reports: { some: { id } } },
      select: { externalId: true },
    })
    const completion = await db.courseCompletion.findFirstOrThrow({
      where: { employeeId: id, providerId: { not: null } },
      select: { providerId: true, course: { select: { code: true } } },
    })
    const department = await db.department.findFirstOrThrow({
      where: { employees: { some: { id } } },
      select: { id: true },
    })

    for (const role of ['VIEWER', 'FULL', 'ADMIN'] as const) {
      const reads: Record<string, () => Promise<unknown>> = {
        listEmployees: () => listEmployees({}, options),
        listReports: () => listEmployees({ manager: manager.externalId }, options),
        report: () => getEmployee(report.externalId, role, options),
        manager: () => getEmployee(manager.externalId, role, options),
        self: () => getEmployee(ID, role, options),
        course: () => getCourse(completion.course.code, options),
        session: () => getSession('T001', options),
        pastSessions: () => listSessions({ window: 'past' }, options),
        provider: () => getProvider(completion.providerId ?? '', role, options),
        providers: () => listProviders(role, options),
        department: () => getDepartment(department.id, options),
        departments: () => listDepartmentSummaries(options),
        matrix: () => getComplianceMatrix(options),
        dashboard: () => getDashboard(options),
        advisor: () => getAdvisorInput(options),
        planner: () => getPlannerInput(options),
        personName: () => getPersonName(ID, options),
        reference: () => loadReferenceSnapshot(db),
        bookings: () => listUpcomingBookings({ department: department.id }, options),
        archived: () => listArchived('employee', 'ADMIN', options),
      }
      for (const [name, read] of Object.entries(reads)) {
        const text = JSON.stringify(await read())
        for (const secret of [FIRST, LAST, EMAIL, ID])
          expect(text, `${role} ${name}: ${secret}`).not.toContain(secret)
      }
    }
    // The report's manager and the past session's attendee are there, as the tag stored when
    // they were archived: random, not one anybody could work out from the id lists send.
    const { archiveTag: tag } = await db.employee.findUniqueOrThrow({
      where: { id },
      select: { archiveTag: true },
    })
    expect(tag).toMatch(/^[0-9a-f]{6}$/)
    expect(tag).not.toBe(archiveTag(id))
    expect((await getEmployee(report.externalId, 'ADMIN', options))?.manager).toEqual({
      archived: true,
      tag,
    })
    expect((await getSession('T001', options))?.bookings.map(b => b.person)).toContainEqual({
      archived: true,
      tag,
    })

    // Only the admin's page for the archived record says who it was.
    const revealed = await getArchivedRecord('employee', id, 'ADMIN', options)
    expect(revealed?.title).toBe(`${LAST} ${FIRST}`)
    expect(revealed?.fields).toContainEqual({ key: 'email', value: EMAIL, type: 'text' })
    expect(revealed?.label).toBeNull()
    for (const role of ['VIEWER', 'FULL'] as const) {
      await expect(getArchivedRecord('employee', id, role, options)).rejects.toThrow()
      await expect(listArchived('employee', role, options)).rejects.toThrow()
    }
    expect(
      await getArchivedRecord('employee', await idOf('employee', 'E0001'), 'ADMIN', options)
    ).toBeNull()
  })

  it('anonymises an archived user wherever a record names them', async () => {
    const user = await db.user.create({
      data: {
        clerkId: 'user_it_archive_u',
        name: FIRST,
        email: EMAIL,
        role: 'FULL',
        syncedAt: new Date(),
      },
    })
    const position = await db.position.create({ data: { name: `${NAME} pozice 2` } })
    expect(await archiveRecord('position', position.id, user.id, options)).toMatchObject({
      ok: true,
    })
    expect(await archive('user', user.id)).toMatchObject({ ok: true })
    const text = JSON.stringify(await listArchived('position', 'ADMIN', options))
    expect(text).not.toContain(FIRST)
    expect(text).not.toContain(EMAIL)
    const revealed = await getArchivedRecord('user', user.id, 'ADMIN', options)
    expect(revealed?.title).toBe(FIRST)
  })
})

describe('archived records, for admins', () => {
  it('lists every kind, newest first, and opens each with its real details', async () => {
    const course = await fixtureCourse('TEST-ARCH-L')
    const room = await fixtureRoom(`${ROOM} seznam`)
    const employee = await fixtureEmployee('XA0010')
    const session = await db.courseSession.create({
      data: {
        externalId: 'XA-S10',
        courseId: course.id,
        roomId: room,
        providerId: await defaultProviderId(db),
        startsAt: new Date('2026-08-01T08:00:00Z'),
        endsAt: new Date('2026-08-01T10:00:00Z'),
        capacity: 4,
      },
    })
    const provider = await db.provider.create({ data: { name: `${NAME} dodavatel L` } })
    const completion = await db.courseCompletion.create({
      data: {
        externalId: 'XA-C10',
        employeeId: employee.id,
        courseId: course.id,
        completedOn: new Date('2026-08-01'),
        validUntil: new Date('2028-08-01'),
        providerId: provider.id,
      },
    })
    const department = await db.department.create({ data: { name: `${NAME} útvar L` } })
    const position = await db.position.create({ data: { name: `${NAME} pozice L` } })
    const user = await db.user.create({
      data: { clerkId: 'user_it_archive_l', name: 'Lída Archivní', syncedAt: new Date() },
    })
    const records = [
      ['completion', completion.id, 'XA-C10'],
      ['session', session.id, 'XA-S10'],
      ['employee', employee.id, null],
      ['course', course.id, 'TEST-ARCH-L'],
      ['room', room, `${ROOM} seznam`],
      ['provider', provider.id, `${NAME} dodavatel L`],
      ['department', department.id, `${NAME} útvar L`],
      ['position', position.id, `${NAME} pozice L`],
      ['user', user.id, null],
    ] as const
    // A page finds its record by the key in its address: external IDs, a course code, ids.
    const keys = {
      completion: completion.id,
      session: 'XA-S10',
      employee: 'XA0010',
      course: 'TEST-ARCH-L',
      room,
      provider: provider.id,
      department: department.id,
      position: position.id,
      user: user.id,
    }
    for (const [kind] of records) {
      expect(await recordExists(kind, keys[kind], options), kind).toBe(true)
      expect(await recordExists(kind, 'nope', options), kind).toBe(false)
    }
    for (const [kind, id] of records)
      expect(await archive(kind, id), kind).toMatchObject({ ok: true })
    for (const [kind, id] of records) {
      expect(await recordExists(kind, keys[kind], options), kind).toBe(false)
      expect(await recordExists(kind, id, { ...options, archived: true }), kind).toBe(true)
    }
    expect(await recordExists('course', course.id, { ...options, archived: true })).toBe(true)
    expect(await recordExists('room', 'nope', { ...options, archived: true })).toBe(false)

    for (const [kind, id, label] of records) {
      const listed = (await listArchived(kind, 'ADMIN', options)).find(i => i.id === id)
      // People carry their stored tag; other records one derived from the id.
      const select = { where: { id }, select: { archiveTag: true } }
      const stored =
        kind === 'employee'
          ? (await db.employee.findFirstOrThrow(select)).archiveTag
          : kind === 'user'
            ? (await db.user.findFirstOrThrow(select)).archiveTag
            : archiveTag(id)
      expect(listed, kind).toMatchObject({
        label,
        tag: stored,
        archivedBy: { archived: false, id: TEST_USER },
      })
      const record = await getArchivedRecord(kind, id, 'ADMIN', options)
      expect(record, kind).toMatchObject({ kind, id, label })
      expect(record?.fields.length, kind).toBeGreaterThan(0)
      // An active record has no archived page.
      expect(await getArchivedRecord(kind, 'nope', 'ADMIN', options), kind).toBeNull()
    }
    const revealed = await getArchivedRecord('completion', completion.id, 'ADMIN', options)
    expect(revealed?.fields).toEqual([
      { key: 'externalId', value: 'XA-C10', type: 'text' },
      { key: 'course', value: `TEST-ARCH-L ${NAME} kurz`, type: 'text' },
      { key: 'completedOn', value: '2026-08-01', type: 'date' },
      { key: 'validUntil', value: '2028-08-01', type: 'date' },
      { key: 'provider', value: `${NAME} dodavatel L`, type: 'text' },
    ])
    expect((await getArchivedRecord('user', user.id, 'ADMIN', options))?.title).toBe(
      'Lída Archivní'
    )
    expect((await getArchivedRecord('employee', employee.id, 'ADMIN', options))?.title).toBe(
      'Archivní Test'
    )
  })
})

describe('integrity', () => {
  it('has no foreign key left that deletes or nulls history', async () => {
    const keys = await db.$queryRaw<{ name: string; action: string }[]>`
      SELECT conname AS name, confdeltype::text AS action FROM pg_constraint WHERE contype = 'f'`
    expect(keys.length).toBeGreaterThan(20)
    expect(keys.filter(k => k.action !== 'r')).toEqual([])
  })

  it('refuses to delete anything that carries history', async () => {
    const id = await idOf('course', 'BOZP-Z')
    await expect(db.course.delete({ where: { id } })).rejects.toMatchObject({ code: 'P2003' })
    const room = await db.room.findFirstOrThrow({ where: { name: 'Aula A' } })
    await expect(db.room.delete({ where: { id: room.id } })).rejects.toMatchObject({
      code: 'P2003',
    })
  })

  it('keeps the single-row rules in the database, whatever writes', async () => {
    const checks = await db.$queryRaw<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint WHERE contype = 'c'`
    expect(checks.map(c => c.name)).toEqual(
      expect.arrayContaining([
        'employees_head_member_check',
        'employees_manager_check',
        'employees_left_on_check',
        'course_sessions_times_check',
        'course_sessions_price_check',
        'course_completions_valid_until_check',
        'course_completions_price_check',
        'courses_validity_months_check',
        'courses_session_minutes_check',
        'courses_seats_check',
        'provider_courses_price_check',
      ])
    )
    const person = await db.employee.findFirstOrThrow({ where: { externalId: 'E0153' } })
    const session = await db.courseSession.findFirstOrThrow({ where: { externalId: 'T018' } })
    const completion = await db.courseCompletion.findFirstOrThrow({
      where: { externalId: { startsWith: 'Z' } },
    })
    const course = await idOf('course', 'BOZP-Z')
    for (const [write, constraint] of [
      [
        db.employee.update({ where: { id: person.id }, data: { leftOn: new Date('1990-01-01') } }),
        'employees_left_on_check',
      ],
      [
        db.courseSession.update({ where: { id: session.id }, data: { endsAt: session.startsAt } }),
        'course_sessions_times_check',
      ],
      [
        db.courseSession.update({ where: { id: session.id }, data: { pricePerPerson: -1 } }),
        'course_sessions_price_check',
      ],
      [
        db.courseCompletion.update({
          where: { id: completion.id },
          data: { validUntil: new Date('1990-01-01') },
        }),
        'course_completions_valid_until_check',
      ],
      [
        db.courseCompletion.update({ where: { id: completion.id }, data: { price: -1 } }),
        'course_completions_price_check',
      ],
      [
        db.course.update({ where: { id: course }, data: { validityMonths: 0 } }),
        'courses_validity_months_check',
      ],
      [db.course.update({ where: { id: course }, data: { seats: 0 } }), 'courses_seats_check'],
      [
        db.course.update({ where: { id: course }, data: { sessionMinutes: 0 } }),
        'courses_session_minutes_check',
      ],
    ] as const)
      await expect(write, constraint).rejects.toThrow(constraint)
  })
})
