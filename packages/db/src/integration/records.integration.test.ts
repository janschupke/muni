import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { needing } from '../../test/needs'
import { defaultProviderId, offer } from '../../test/providers'
import { completionOf, courseIdOf } from '../../test/records'
import { TEST_USER } from '../../test/users'
import { createDb } from '../connect'
import {
  applyAssignments,
  archiveImpact,
  archiveRecord,
  checkSessionSlot,
  createCompletion,
  createCourse,
  createEmployee,
  createRoom,
  createSession,
  getCompletionForEdit,
  getCourse,
  getCourseForEdit,
  getDepartment,
  getDepartmentForEdit,
  getEmployee,
  getEmployeeForEdit,
  getPosition,
  getPositionForEdit,
  getUser,
  listDepartmentHeads,
  listDepartmentPositions,
  listDepartmentSummaries,
  listEmployeeOptions,
  listGroupOptions,
  listPositionSummaries,
  listUpcomingBookings,
  removeAssignment,
  revertUserRole,
  saveDepartment,
  savePosition,
  setUserRole,
  unarchiveRecord,
  updateCompletion,
  updateCourse,
  updateEmployee,
  updateRoom,
  updateSession,
} from '../repositories'

// Creating and editing courses, people, completions, departments and positions, and the
// pickers' lists.

const db = createDb()
const asOf = '2026-10-16'
const now = new Date('2026-10-16T12:00:00Z')
const options = { db, asOf, now }
const NAME = 'Záznam test'

afterAll(async () => {
  await db.$disconnect()
})

const course = {
  name: `${NAME} kurz`,
  validityMonths: 12,
  requiredForAll: false,
  departmentIds: [] as string[],
  positionIds: [] as string[],
  sessionMinutes: 60,
  seats: 10,
  onlineAllowed: false,
  capabilities: [] as ('PROJECTOR' | 'COMPUTERS')[],
}

const idOf = async (externalId: string) =>
  (await db.employee.findFirstOrThrow({ where: { externalId, archivedAt: null } })).id

const person = {
  firstName: 'Nová',
  lastName: 'Osoba',
  email: null as string | null,
  nationalId: null,
  departmentId: null as string | null,
  positionId: null,
  managerId: null as string | null,
  leadsDepartment: false,
  hiredOn: '2026-10-01',
  leftOn: null,
  status: 'ACTIVE' as const,
  note: null,
}

describe('courses', () => {
  it('creates a course with who must hold it, and refuses a code an active course has', async () => {
    const lab = await db.department.findFirstOrThrow({ where: { name: 'Laboratoře' } })
    const head = await db.position.findFirstOrThrow({ where: { name: 'Vedoucí' } })
    expect(
      await createCourse(
        {
          ...course,
          code: 'TEST-REC-1',
          departmentIds: [lab.id],
          positionIds: [head.id],
          capabilities: ['PROJECTOR'],
        },
        options
      )
    ).toEqual({ ok: true, code: 'TEST-REC-1' })
    expect(await getCourseForEdit('TEST-REC-1', options)).toMatchObject({
      departmentIds: [lab.id],
      positionIds: [head.id],
      capabilities: ['PROJECTOR'],
    })
    expect((await getCourse('TEST-REC-1', options))?.requirements).toEqual([
      { scope: 'DEPARTMENT', target: 'Laboratoře', targetId: lab.id, archived: false },
      { scope: 'POSITION', target: 'Vedoucí', targetId: head.id, archived: false },
    ])
    expect(await createCourse({ ...course, code: 'TEST-REC-1' }, options)).toEqual({
      ok: false,
      field: 'code',
      reason: 'taken',
    })
  })

  it('replaces who must hold it, and refuses a department that is gone', async () => {
    expect(await updateCourse('TEST-REC-1', { ...course, requiredForAll: true }, options)).toEqual({
      ok: true,
      code: 'TEST-REC-1',
    })
    expect(await getCourseForEdit('TEST-REC-1', options)).toMatchObject({
      requiredForAll: true,
      departmentIds: [],
      positionIds: [],
    })
    const gone = await db.department.create({ data: { name: `${NAME} pryč` } })
    await archiveRecord('department', gone.id, TEST_USER, options)
    expect(
      await updateCourse('TEST-REC-1', { ...course, departmentIds: [gone.id] }, options)
    ).toEqual({ ok: false, field: 'departmentIds', reason: 'not_found' })
    expect(await updateCourse('TEST-REC-1', { ...course, positionIds: ['nope'] }, options)).toEqual(
      { ok: false, field: 'positionIds', reason: 'not_found' }
    )
    // Refused writes change nothing.
    expect((await getCourseForEdit('TEST-REC-1', options))?.requiredForAll).toBe(true)
    await expect(updateCourse('TEST-REC-X', course, options)).rejects.toMatchObject({
      code: 'P2025',
    })
  })
})

describe('people', () => {
  it('creates people with app IDs, never reused, and refuses a taken email', async () => {
    const first = await createEmployee({ ...person, email: 'nova.osoba@archiv.example' }, options)
    const second = await createEmployee({ ...person, lastName: 'Druhá' }, options)
    expect(first).toEqual({ ok: true, externalId: 'N0001' })
    expect(second).toEqual({ ok: true, externalId: 'N0002' })
    const id = (await db.employee.findFirstOrThrow({ where: { externalId: 'N0002' } })).id
    await archiveRecord('employee', id, TEST_USER, options)
    expect(await createEmployee({ ...person, lastName: 'Třetí' }, options)).toEqual({
      ok: true,
      externalId: 'N0003',
    })
    expect(
      await createEmployee({ ...person, email: 'nova.osoba@archiv.example' }, options)
    ).toEqual({ ok: false, field: 'email', reason: 'taken' })
    expect(await getEmployee('N0001', 'ADMIN', options)).toMatchObject({
      firstName: 'Nová',
      lastName: 'Osoba',
      status: 'ACTIVE',
    })
  })

  it('links a department, a position it has and a manager, refusing loops and archived links', async () => {
    const department = await db.department.create({ data: { name: `${NAME} útvar` } })
    const position = await savePosition(
      null,
      { name: `${NAME} pozice`, departmentIds: [department.id] },
      options
    )
    if (!position.ok) throw new Error('no position')
    const e0001 = await idOf('E0001')
    expect(
      await updateEmployee(
        'N0001',
        {
          ...person,
          departmentId: department.id,
          positionId: position.id,
          managerId: e0001,
          nationalId: '8551011234',
        },
        options
      )
    ).toEqual({ ok: true, externalId: 'N0001' })
    expect(await getEmployeeForEdit('N0001', options)).toMatchObject({
      departmentId: department.id,
      positionId: position.id,
      managerId: e0001,
      manager: { id: e0001 },
      nationalId: '8551011234',
    })
    // A position the department does not have.
    const other = await db.position.findFirstOrThrow({ where: { name: 'Knihovník' } })
    expect(
      await updateEmployee(
        'N0001',
        { ...person, departmentId: department.id, positionId: other.id },
        options
      )
    ).toEqual({ ok: false, field: 'positionId', reason: 'pair_unknown' })
    // The database says so too: a person holds only a pair that exists.
    await expect(
      db.employee.update({
        where: { id: await idOf('N0001') },
        data: { positionId: other.id },
      })
    ).rejects.toMatchObject({ code: 'P2003' })
    expect(await listDepartmentPositions(options)).toMatchObject({ [department.id]: [position.id] })

    // N0003 reports to N0001: N0001 may not report to N0003, nor to themselves.
    const n0001 = await idOf('N0001')
    const n0003 = await idOf('N0003')
    await updateEmployee('N0003', { ...person, managerId: n0001 }, options)
    for (const manager of [n0003, n0001])
      expect(await updateEmployee('N0001', { ...person, managerId: manager }, options)).toEqual({
        ok: false,
        field: 'managerId',
        reason: 'manager_cycle',
      })
    // Nobody manages themselves, whatever writes it.
    await expect(
      db.employee.update({ where: { id: n0001 }, data: { managerId: n0001 } })
    ).rejects.toThrow(/employees_manager_check/)
    const archived = (await db.employee.findFirstOrThrow({ where: { externalId: 'N0002' } })).id
    expect(await updateEmployee('N0001', { ...person, managerId: archived }, options)).toEqual({
      ok: false,
      field: 'managerId',
      reason: 'not_found',
    })
    expect(await updateEmployee('N0001', { ...person, departmentId: 'nope' }, options)).toEqual({
      ok: false,
      field: 'departmentId',
      reason: 'not_found',
    })
    expect(await updateEmployee('N0001', { ...person, positionId: 'nope' }, options)).toEqual({
      ok: false,
      field: 'positionId',
      reason: 'not_found',
    })
    expect(await createEmployee({ ...person, managerId: 'nope' }, options)).toMatchObject({
      ok: false,
      field: 'managerId',
    })
    await expect(updateEmployee('N9999', person, options)).rejects.toMatchObject({
      code: 'P2025',
    })
    // A manager who has left is still offered to the people they managed.
    await updateEmployee('N0001', { ...person, leftOn: '2026-10-02' }, options)
    expect((await listEmployeeOptions(options)).some(p => p.id === n0001)).toBe(false)
    expect((await getEmployeeForEdit('N0003', options))?.manager).toEqual({
      id: n0001,
      name: 'Osoba Nová',
    })
    // Once archived, they are not: saving then leaves the person without one.
    await archiveRecord('employee', n0001, TEST_USER, options)
    expect(await getEmployeeForEdit('N0003', options)).toMatchObject({
      managerId: null,
      manager: null,
    })
  })

  it('makes one member the head of their department, and only a member', async () => {
    const department = await db.department.create({ data: { name: `${NAME} vedení` } })
    const n0003 = await idOf('N0003')
    await updateEmployee('N0003', { ...person, departmentId: department.id }, options)
    const fourth = await createEmployee(
      { ...person, lastName: 'Čtvrtá', departmentId: department.id, leadsDepartment: true },
      options
    )
    if (!fourth.ok) throw new Error('not created')
    const n0004 = await idOf(fourth.externalId)
    expect(await listDepartmentHeads(options)).toMatchObject({ [department.id]: 'Čtvrtá Nová' })
    expect((await getDepartment(department.id, options))?.head).toMatchObject({
      archived: false,
      externalId: fourth.externalId,
    })
    // The department's form hands the role over; only to one of its people.
    expect(
      await saveDepartment(department.id, { name: `${NAME} vedení`, headId: n0003 }, options)
    ).toEqual({ ok: true, id: department.id })
    expect(await getDepartmentForEdit(department.id, options)).toMatchObject({
      headId: n0003,
      members: [
        { id: n0004, name: 'Čtvrtá Nová' },
        { id: n0003, name: 'Osoba Nová' },
      ],
    })
    expect((await getEmployee(fourth.externalId, 'ADMIN', options))?.leadsDepartment).toBe(false)
    expect(
      await saveDepartment(
        department.id,
        { name: `${NAME} vedení`, headId: await idOf('E0001') },
        options
      )
    ).toEqual({ ok: false, field: 'headId', reason: 'not_a_member' })
    // So does the person's form: whoever led it before no longer does.
    await updateEmployee(
      fourth.externalId,
      { ...person, lastName: 'Čtvrtá', departmentId: department.id, leadsDepartment: true },
      options
    )
    expect(await listDepartmentHeads(options)).toMatchObject({ [department.id]: 'Čtvrtá Nová' })
    expect((await getEmployee('N0003', 'ADMIN', options))?.leadsDepartment).toBe(false)
    // The database keeps one head per department, and a head in their department.
    await expect(
      db.employee.update({ where: { id: n0003 }, data: { leadsDepartment: true } })
    ).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      db.employee.update({
        where: { id: n0003 },
        data: { departmentId: null, leadsDepartment: true },
      })
    ).rejects.toThrow(/employees_head_member_check/)
    // Archiving the head leaves the department without one, and says so first.
    expect(await archiveImpact('employee', n0004, options)).toEqual({
      ok: true,
      removesBookings: 0,
      leaves: `${NAME} vedení`,
    })
    await archiveRecord('employee', n0004, TEST_USER, options)
    expect((await getDepartment(department.id, options))?.head).toBeNull()
    expect(await unarchiveRecord('employee', n0004, options)).toEqual({ ok: true })
    expect((await getDepartment(department.id, options))?.head).toBeNull()
    expect(
      await saveDepartment(department.id, { name: `${NAME} vedení`, headId: null }, options)
    ).toEqual({ ok: true, id: department.id })
  })

  it('lists active people who have not left, by name, for pickers', async () => {
    const people = await listEmployeeOptions(options)
    expect(people.some(p => p.externalId === 'N0003')).toBe(true)
    expect(people.some(p => p.externalId === 'N0001')).toBe(false)
    const left = await db.employee.findFirstOrThrow({ where: { leftOn: { lte: now } } })
    expect(people.some(p => p.externalId === left.externalId)).toBe(false)
    expect(people.map(p => p.name)).toEqual(
      people.map(p => p.name).toSorted((a, b) => a.localeCompare(b, 'cs'))
    )
  })
})

describe('completions', () => {
  it('corrects a completion, and says when it came from an import', async () => {
    const created = await createCompletion(
      await completionOf(db, { employee: 'N0003', course: 'BOZP-Z', completedOn: '2026-09-01' }),
      options
    )
    expect(created).toEqual({ ok: true, employeeExternalId: 'N0003' })
    const { id } = await db.courseCompletion.findFirstOrThrow({
      where: { employee: { externalId: 'N0003' }, completedOn: new Date('2026-09-01') },
    })
    // An empty validity is the course's: BOZP-Z holds for 24 months, and the form shows it empty.
    expect(await getCompletionForEdit(id, options)).toMatchObject({ validUntil: null })
    expect(
      (await db.courseCompletion.findUniqueOrThrow({ where: { id } })).validUntil?.toISOString()
    ).toBe('2028-09-01T00:00:00.000Z')
    expect(
      await updateCompletion(
        id,
        {
          ...(await completionOf(db, {
            employee: 'N0003',
            course: 'GDPR',
            completedOn: '2026-09-02',
            validUntil: '2028-09-01',
            newProvider: `${NAME} dodavatel`,
            price: 300,
          })),
          note: '  opraveno ',
        },
        options
      )
    ).toEqual({ ok: true, employeeExternalId: 'N0003' })
    expect(await getCompletionForEdit(id, options)).toMatchObject({
      imported: false,
      course: { code: 'GDPR', archived: false },
      completedOn: '2026-09-02',
      validUntil: '2028-09-01',
      provider: { name: `${NAME} dodavatel`, archived: false },
      price: 300,
      note: 'opraveno',
      employee: { externalId: 'N0003', name: 'Osoba Nová' },
    })
    // A new provider is never a twin of one the register has, in any case or accents.
    expect(
      await updateCompletion(
        id,
        await completionOf(db, {
          employee: 'N0003',
          course: 'GDPR',
          completedOn: '2026-09-02',
          newProvider: `${NAME.toUpperCase()} DODAVATEL`,
        }),
        options
      )
    ).toEqual({ ok: false, field: 'newProviderName', reason: 'taken' })
    // An archived provider stays the record's own; nobody else can pick it.
    const provider = await db.provider.findFirstOrThrow({
      where: { name: `${NAME} dodavatel` },
    })
    await archiveRecord('provider', provider.id, TEST_USER, options)
    const kept = await completionOf(db, {
      employee: 'N0003',
      course: 'GDPR',
      completedOn: '2026-09-02',
    })
    expect(await updateCompletion(id, { ...kept, providerId: provider.id }, options)).toMatchObject(
      { ok: true }
    )
    expect(await getCompletionForEdit(id, options)).toMatchObject({
      provider: { id: provider.id, archived: true },
    })
    expect(await createCompletion({ ...kept, providerId: provider.id }, options)).toEqual({
      ok: false,
      field: 'providerId',
      reason: 'not_found',
    })
    // Moved to another person.
    expect(
      await updateCompletion(id, { ...kept, employeeId: await idOf('E0153') }, options)
    ).toEqual({ ok: true, employeeExternalId: 'E0153' })
    expect(await updateCompletion(id, { ...kept, employeeId: 'nope' }, options)).toEqual({
      ok: false,
      field: 'employeeId',
      reason: 'not_found',
    })
    expect(await updateCompletion(id, { ...kept, courseId: 'nope' }, options)).toEqual({
      ok: false,
      field: 'courseId',
      reason: 'not_found',
    })

    const imported = await db.courseCompletion.findFirstOrThrow({
      where: { externalId: { startsWith: 'Z' } },
    })
    expect((await getCompletionForEdit(imported.id, options))?.imported).toBe(true)
    await archiveRecord('completion', id, TEST_USER, options)
    expect(await getCompletionForEdit(id, options)).toBeNull()
    await expect(updateCompletion(id, kept, options)).rejects.toMatchObject({ code: 'P2025' })
  })
})

describe('departments and positions', () => {
  it('create and rename them, refusing a name an active one has in any case', async () => {
    const created = await saveDepartment(null, { name: ` ${NAME} nové `, headId: null }, options)
    if (!created.ok) throw new Error('not created')
    expect(await getDepartmentForEdit(created.id, options)).toEqual({
      id: created.id,
      name: `${NAME} nové`,
      headId: null,
      members: [],
    })
    for (const name of ['Laboratoře', 'LABORATOŘE'])
      expect(await saveDepartment(null, { name, headId: null }, options)).toEqual({
        ok: false,
        field: 'name',
        reason: 'taken',
      })
    expect(
      await saveDepartment(created.id, { name: `${NAME} přejmenované`, headId: null }, options)
    ).toEqual({ ok: true, id: created.id })
    expect(await saveDepartment(created.id, { name: 'Marketing', headId: null }, options)).toEqual({
      ok: false,
      field: 'name',
      reason: 'taken',
    })
    const position = await savePosition(
      null,
      { name: `${NAME} pozice 2`, departmentIds: [created.id] },
      options
    )
    if (!position.ok) throw new Error('not created')
    expect((await listGroupOptions('position', options)).map(p => p.name)).toContain(
      `${NAME} pozice 2`
    )
    expect(await getPositionForEdit(position.id, options)).toEqual({
      id: position.id,
      name: `${NAME} pozice 2`,
      departmentIds: [created.id],
    })
    expect(
      await savePosition(
        position.id,
        { name: `${NAME} pozice 2`, departmentIds: ['nope'] },
        options
      )
    ).toEqual({ ok: false, field: 'departmentIds', reason: 'not_found' })
    await archiveRecord('department', created.id, TEST_USER, options)
    expect(await getDepartmentForEdit(created.id, options)).toBeNull()
    expect((await listGroupOptions('department', options)).map(d => d.id)).not.toContain(created.id)
    await expect(
      saveDepartment(created.id, { name: `${NAME} znovu`, headId: null }, options)
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  it('keeps a position in the departments its people hold it in', async () => {
    const referent = await db.position.findFirstOrThrow({ where: { name: 'Referent' } })
    const before = (await getPositionForEdit(referent.id, options))?.departmentIds ?? []
    expect(before.length).toBeGreaterThan(1)
    const [kept, ...dropped] = before
    const holders = await db.employee.count({
      where: { archivedAt: null, positionId: referent.id, departmentId: { in: dropped } },
    })
    expect(
      await savePosition(referent.id, { name: 'Referent', departmentIds: [kept ?? ''] }, options)
    ).toEqual({ ok: false, field: 'departmentIds', reason: 'in_use', count: holders })
    // Shown on both sides: the position's departments and the department's positions.
    const detail = await getPosition(referent.id, options)
    expect(detail?.departments.map(d => d.id).toSorted()).toEqual(before.toSorted())
    const library = await db.department.findFirstOrThrow({ where: { name: 'Knihovna' } })
    expect((await getDepartment(library.id, options))?.positions.map(p => p.name)).toContain(
      'Referent'
    )
    // A department with nobody in the position can be added and taken away again.
    const extra = await db.department.create({ data: { name: `${NAME} navíc` } })
    expect(
      await savePosition(
        referent.id,
        { name: 'Referent', departmentIds: [...before, extra.id] },
        options
      )
    ).toEqual({ ok: true, id: referent.id })
    expect(
      (await getPosition(referent.id, options))?.departments.find(d => d.id === extra.id)
    ).toMatchObject({ count: 0 })
    expect(
      await savePosition(referent.id, { name: 'Referent', departmentIds: before }, options)
    ).toEqual({ ok: true, id: referent.id })
  })
})

describe('sessions keep fitting their rooms', () => {
  const room = (name: string, over: object = {}) =>
    createRoom(
      {
        name: `${NAME} ${name}`,
        kind: 'CLASSROOM',
        capacity: 10,
        capabilities: [],
        note: null,
        ...over,
      },
      options
    )
  // An hour from 09:00 (the test courses are 60 minutes long), by the default provider.
  const at = { date: '2027-05-03', startTime: '09:00' }
  let providerId = ''
  beforeAll(async () => {
    providerId = await defaultProviderId(db)
  })

  it('re-checks a session whose course or seats change, and the room or course under it', async () => {
    const withProjector = await room('A', { capabilities: ['PROJECTOR'] })
    const bare = await room('B', { capacity: 30 })
    // Required of everyone: the people booked on it below must need it.
    await createCourse(
      { ...course, code: 'TEST-REC-S', seats: null, requiredForAll: true },
      options
    )
    await createCourse({ ...course, code: 'TEST-REC-P', capabilities: ['PROJECTOR'] }, options)
    const plain = await courseIdOf(db, 'TEST-REC-S')
    const projected = await courseIdOf(db, 'TEST-REC-P')
    await offer(db, providerId, plain)
    await offer(db, providerId, projected)
    const created = await createSession(
      {
        ...at,
        providerId,
        courseId: plain,
        roomId: withProjector.id,
        capacity: 8,
      },
      options
    )
    if (!created.ok) throw new Error(created.problem)
    const booked = await applyAssignments(
      (await needing(db, created.externalId, options, 2)).map(employeeExternalId => ({
        sessionExternalId: created.externalId,
        employeeExternalId,
        source: 'MANUAL' as const,
      })),
      TEST_USER,
      options
    )
    expect(booked.map(b => b.ok)).toEqual([true, true])
    const edit = {
      ...at,
      providerId,
      courseId: plain,
      roomId: withProjector.id,
      capacity: 8,
      unnamedBookings: 0,
    }
    // Seats never drop below the bookings, named and unnamed together.
    expect(await updateSession(created.externalId, { ...edit, capacity: 1 }, options)).toEqual({
      ok: false,
      problem: 'OVER_CAPACITY',
    })
    expect(
      await updateSession(created.externalId, { ...edit, capacity: 5, unnamedBookings: 4 }, options)
    ).toEqual({ ok: false, problem: 'OVER_CAPACITY' })
    // Another course: the room is checked against what that course needs.
    expect(
      await updateSession(
        created.externalId,
        { ...edit, courseId: projected, roomId: bare.id },
        options
      )
    ).toEqual({ ok: false, problem: 'ROOM_MISSING_CAPABILITIES' })
    expect(
      await updateSession(created.externalId, { ...edit, courseId: projected }, options)
    ).toEqual({ ok: true, externalId: created.externalId, courseCode: 'TEST-REC-P' })

    // The room cannot shrink under it or lose its projector; the course cannot need more.
    const roomEdit = {
      name: `${NAME} A`,
      kind: 'CLASSROOM' as const,
      capacity: 10,
      capabilities: ['PROJECTOR' as const],
      note: null,
    }
    expect(await updateRoom(withProjector.id, { ...roomEdit, capacity: 5 }, options)).toEqual({
      ok: false,
      field: 'capacity',
      reason: 'sessions_unfit',
      count: 1,
    })
    expect(await updateRoom(withProjector.id, { ...roomEdit, capabilities: [] }, options)).toEqual({
      ok: false,
      field: 'capabilities',
      reason: 'sessions_unfit',
      count: 1,
    })
    expect(await updateRoom(withProjector.id, { ...roomEdit, capacity: 9 }, options)).toEqual({
      ok: true,
      id: withProjector.id,
    })
    expect(
      await updateCourse(
        'TEST-REC-P',
        { ...course, capabilities: ['PROJECTOR', 'COMPUTERS'] },
        options
      )
    ).toEqual({ ok: false, field: 'capabilities', reason: 'sessions_unfit', count: 1 })

    // Nor can a course stop being held online while sessions of it are planned online.
    const online = await db.room.findFirstOrThrow({ where: { kind: 'ONLINE', archivedAt: null } })
    expect(
      await createSession(
        {
          ...at,
          providerId,
          courseId: plain,
          roomId: online.id,
          capacity: 50,
        },
        options
      )
    ).toEqual({ ok: false, problem: 'ROOM_ONLINE_NOT_ALLOWED' })
    await updateCourse('TEST-REC-S', { ...course, seats: null, onlineAllowed: true }, options)
    expect(
      await createSession(
        {
          ...at,
          providerId,
          courseId: plain,
          roomId: online.id,
          capacity: 50,
        },
        options
      )
    ).toMatchObject({ ok: true })
    expect(
      await updateCourse('TEST-REC-S', { ...course, seats: null, onlineAllowed: false }, options)
    ).toEqual({ ok: false, field: 'onlineAllowed', reason: 'sessions_unfit', count: 1 })

    // What the form asks while the user picks: the room is taken then, except by itself.
    const slot = { roomId: withProjector.id, date: at.date, startTime: '09:30', endTime: '10:30' }
    expect(await checkSessionSlot(slot, null, options)).toBe('ROOM_BUSY')
    expect(await checkSessionSlot(slot, created.externalId, options)).toBeNull()
    expect(await checkSessionSlot({ ...slot, roomId: online.id }, null, options)).toBeNull()
    expect(await checkSessionSlot({ ...slot, endTime: '09:00' }, null, options)).toBeNull()
  })

  it('lets a seat cut and a booking race, and keeps the bookings within the seats', async () => {
    const tight = await room('C')
    const created = await createSession(
      {
        ...at,
        providerId,
        date: '2027-05-04',
        courseId: await courseIdOf(db, 'TEST-REC-S'),
        roomId: tight.id,
        capacity: 3,
      },
      options
    )
    if (!created.ok) throw new Error(created.problem)
    const book = (employeeExternalId: string) =>
      applyAssignments(
        [{ sessionExternalId: created.externalId, employeeExternalId, source: 'MANUAL' }],
        TEST_USER,
        options
      )
    await book('E0153')
    await book('E0131')
    // The test holds the session's row lock, which both writes take, until both are waiting
    // for it: they are certainly in flight together, and only the lock decides who goes first.
    const release = Promise.withResolvers<undefined>()
    const held = Promise.withResolvers<undefined>()
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM course_sessions WHERE external_id = ${created.externalId} FOR UPDATE`
      held.resolve(undefined)
      await release.promise
    })
    await held.promise
    const race = Promise.all([
      updateSession(
        created.externalId,
        {
          ...at,
          providerId,
          date: '2027-05-04',
          courseId: await courseIdOf(db, 'TEST-REC-S'),
          roomId: tight.id,
          capacity: 2,
          unnamedBookings: 0,
        },
        options
      ),
      book('E0001'),
    ])
    await vi.waitFor(async () => {
      const [waiting] = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`
      expect(waiting?.n).toBe(2)
    })
    release.resolve(undefined)
    await holder
    const [cut, booking] = await race
    // Exactly one of them wins, whichever goes first.
    expect([cut.ok, booking[0]?.ok].filter(Boolean)).toHaveLength(1)
    const session = await db.courseSession.findFirstOrThrow({
      where: { externalId: created.externalId },
      include: { _count: { select: { assignments: true } } },
    })
    expect(session._count.assignments).toBeLessThanOrEqual(session.capacity)
  })
})

describe('upcoming bookings of a department or a position', () => {
  it('lists the bookings its "upcoming bookings" counts, soonest first, each its own person', async () => {
    const [person] = await needing(db, 'T018', options, 1)
    if (!person) throw new Error('fixture')
    const [made] = await applyAssignments(
      [{ sessionExternalId: 'T018', employeeExternalId: person, source: 'MANUAL' }],
      TEST_USER,
      options
    )
    expect(made?.ok).toBe(true)
    const groups = [
      ...(await listDepartmentSummaries(options)).map(g => ({ of: { department: g.id }, g })),
      ...(await listPositionSummaries(options)).map(g => ({ of: { position: g.id }, g })),
    ]
    expect(groups.some(({ g }) => g.upcomingBookings > 0)).toBe(true)
    for (const { of, g } of groups) {
      const bookings = await listUpcomingBookings(of, options)
      expect(bookings, g.name).toHaveLength(g.upcomingBookings)
      const starts = bookings.map(b => b.startsAt)
      expect(starts).toEqual(starts.toSorted())
      expect(bookings.every(b => b.endsAt >= now.toISOString())).toBe(true)
    }
    await removeAssignment('T018', person, options)
  })
})

describe('users', () => {
  it('shows a user with the bookings they made, and changes roles but not one’s own or the last admin’s', async () => {
    const admin = await db.user.create({
      data: { clerkId: 'user_it_rec_admin', role: 'ADMIN', name: 'Adéla', syncedAt: now },
    })
    const viewer = await db.user.create({
      data: { clerkId: 'user_it_rec_viewer', role: 'VIEWER', name: 'Vilém', syncedAt: now },
    })
    expect(await getUser(TEST_USER, options)).toMatchObject({
      bookingsMade: await db.sessionAssignment.count({ where: { createdById: TEST_USER } }),
    })
    expect(await getUser('nope', options)).toBeNull()
    expect(await setUserRole(viewer.id, 'FULL', admin.id, options)).toEqual({
      ok: true,
      clerkId: 'user_it_rec_viewer',
      previous: 'VIEWER',
    })
    expect((await getUser(viewer.id, options))?.role).toBe('FULL')
    // When Clerk refuses, the role goes back, unless something changed it again meanwhile.
    await revertUserRole(viewer.id, { from: 'VIEWER', to: 'ADMIN' }, options)
    expect((await getUser(viewer.id, options))?.role).toBe('FULL')
    await revertUserRole(viewer.id, { from: 'VIEWER', to: 'FULL' }, options)
    expect((await getUser(viewer.id, options))?.role).toBe('VIEWER')
    expect(await setUserRole(admin.id, 'VIEWER', admin.id, options)).toEqual({
      ok: false,
      reason: 'SELF',
    })
    expect(await setUserRole('nope', 'FULL', admin.id, options)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    })
    // With every other admin archived for the check, Adéla is the last one.
    await db.user.updateMany({
      where: { role: 'ADMIN', archivedAt: null, id: { not: admin.id } },
      data: { archivedAt: now, archivedById: TEST_USER },
    })
    expect(await setUserRole(admin.id, 'FULL', viewer.id, options)).toEqual({
      ok: false,
      reason: 'LAST_ADMIN',
    })
    // Two admins demoting each other at once: one goes through, the other is refused.
    expect(await setUserRole(viewer.id, 'ADMIN', admin.id, options)).toMatchObject({ ok: true })
    const both = await Promise.all([
      setUserRole(admin.id, 'FULL', viewer.id, options),
      setUserRole(viewer.id, 'FULL', admin.id, options),
    ])
    expect(both.filter(r => r.ok)).toHaveLength(1)
    expect(both.filter(r => !r.ok)).toEqual([{ ok: false, reason: 'LAST_ADMIN' }])
    expect(await db.user.count({ where: { role: 'ADMIN', archivedAt: null } })).toBe(1)
    // Whoever is still admin hands the role back, so the clean-up finds what it expects.
    const [still] = await db.user.findMany({
      where: { role: 'ADMIN', archivedAt: null },
      select: { id: true },
    })
    const other = still?.id === admin.id ? viewer.id : admin.id
    expect(await setUserRole(other, 'ADMIN', still?.id ?? '', options)).toMatchObject({ ok: true })
  })
})
