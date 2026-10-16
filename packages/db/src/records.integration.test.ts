import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteCourses, unarchiveAll } from '../test/archive'
import { createTestUser, deleteTestUser, TEST_USER } from '../test/users'
import { createDb } from './client'
import {
  applyAssignments,
  archiveRecord,
  canSetUserRole,
  createCompletion,
  createCourse,
  createEmployee,
  createGroup,
  getCompletionForEdit,
  getCourse,
  getCourseForEdit,
  getEmployee,
  getEmployeeForEdit,
  getGroupForEdit,
  getUser,
  listBookableSessions,
  listEmployeeOptions,
  listGroupOptions,
  renameGroup,
  setUserRole,
  updateCompletion,
  updateCourse,
  updateEmployee,
} from './repositories'
import { seedFromDirectory } from './seed'

// Creating and editing courses, people, completions, departments and positions, and the
// pickers' lists. Everything created here is removed again.

const db = createDb()
const asOf = '2026-10-16'
const now = new Date('2026-10-16T12:00:00Z')
const options = { db, asOf, now }
const DATA_DIR = path.join(import.meta.dirname, '../../../data')
const NAME = 'Záznam test'

const cleanUp = async () => {
  await db.sessionAssignment.deleteMany({ where: { createdById: TEST_USER } })
  await db.courseCompletion.deleteMany({
    where: {
      OR: [
        { employee: { externalId: { startsWith: 'N' } } },
        { course: { code: { startsWith: 'TEST-REC' } } },
      ],
    },
  })
  await db.employee.updateMany({
    where: { manager: { externalId: { startsWith: 'N' } } },
    data: { managerId: null },
  })
  await db.employee.deleteMany({ where: { externalId: { startsWith: 'N' } } })
  await deleteCourses(db, { code: { startsWith: 'TEST-REC' } })
  await unarchiveAll(db)
  await db.employee.updateMany({
    where: { department: { name: { startsWith: NAME } } },
    data: { departmentId: null },
  })
  await db.department.deleteMany({ where: { name: { startsWith: NAME } } })
  await db.position.deleteMany({ where: { name: { startsWith: NAME } } })
  await db.provider.deleteMany({ where: { name: { startsWith: NAME } } })
  await db.user.deleteMany({ where: { clerkId: { startsWith: 'user_it_rec' } } })
  await seedFromDirectory(db, DATA_DIR, asOf)
}

beforeAll(async () => {
  await cleanUp()
  await createTestUser(db)
})
afterAll(async () => {
  await cleanUp()
  await deleteTestUser(db)
  await db.$disconnect()
})

const course = {
  name: `${NAME} kurz`,
  validityMonths: 12,
  requiredForAll: false,
  departmentIds: [] as string[],
  positionIds: [] as string[],
  sessionMinutes: 60,
  groupSize: 10,
  onlineAllowed: false,
  capabilities: [] as ('PROJECTOR' | 'COMPUTERS')[],
}

const person = {
  firstName: 'Nová',
  lastName: 'Osoba',
  email: null as string | null,
  nationalId: null,
  departmentId: null as string | null,
  positionId: null,
  managerExternalId: null as string | null,
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

  it('links a department, position and manager, refusing loops and archived links', async () => {
    const department = await db.department.create({ data: { name: `${NAME} útvar` } })
    const position = await db.position.create({ data: { name: `${NAME} pozice` } })
    expect(
      await updateEmployee(
        'N0001',
        {
          ...person,
          departmentId: department.id,
          positionId: position.id,
          managerExternalId: 'E0001',
          nationalId: '8551011234',
        },
        options
      )
    ).toEqual({ ok: true, externalId: 'N0001' })
    expect(await getEmployeeForEdit('N0001', options)).toMatchObject({
      departmentId: department.id,
      positionId: position.id,
      managerExternalId: 'E0001',
      nationalId: '8551011234',
    })
    // N0003 reports to N0001: N0001 may not report to N0003, nor to themselves.
    await updateEmployee('N0003', { ...person, managerExternalId: 'N0001' }, options)
    for (const manager of ['N0003', 'N0001'])
      expect(
        await updateEmployee('N0001', { ...person, managerExternalId: manager }, options)
      ).toEqual({ ok: false, field: 'managerExternalId', reason: 'manager_cycle' })
    expect(
      await updateEmployee('N0001', { ...person, managerExternalId: 'N0002' }, options)
    ).toEqual({ ok: false, field: 'managerExternalId', reason: 'not_found' })
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
    expect(await createEmployee({ ...person, managerExternalId: 'E9999' }, options)).toMatchObject({
      ok: false,
      field: 'managerExternalId',
    })
    await expect(updateEmployee('N9999', person, options)).rejects.toMatchObject({
      code: 'P2025',
    })
    // The manager's former link is not offered once they are archived.
    const manager = await db.employee.findFirstOrThrow({ where: { externalId: 'N0001' } })
    await db.employee.update({
      where: { id: manager.id },
      data: { departmentId: null, positionId: null },
    })
    await archiveRecord('employee', manager.id, TEST_USER, options)
    expect((await getEmployeeForEdit('N0003', options))?.managerExternalId).toBeNull()
  })

  it('lists active people who have not left, by name, for pickers', async () => {
    const people = await listEmployeeOptions(options)
    expect(people.some(p => p.externalId === 'N0003')).toBe(true)
    expect(people.some(p => p.externalId === 'N0001')).toBe(false)
    const terminated = await db.employee.findFirstOrThrow({ where: { status: 'TERMINATED' } })
    expect(people.some(p => p.externalId === terminated.externalId)).toBe(false)
    expect(people.map(p => p.name)).toEqual(
      people.map(p => p.name).toSorted((a, b) => a.localeCompare(b, 'cs'))
    )
  })
})

describe('completions', () => {
  it('corrects a completion, and says when it came from an import', async () => {
    const created = await createCompletion(
      'N0003',
      {
        courseCode: 'BOZP-Z',
        completedOn: '2026-09-01',
        validUntil: null,
        provider: null,
        price: null,
        note: null,
      },
      options
    )
    const { id } = await db.courseCompletion.findFirstOrThrow({
      where: { externalId: created.externalId },
    })
    expect(
      await updateCompletion(
        id,
        {
          courseCode: 'GDPR',
          completedOn: '2026-09-02',
          validUntil: '2028-09-02',
          provider: `${NAME} dodavatel`,
          price: 300,
          note: '  opraveno ',
        },
        options
      )
    ).toEqual({ externalId: created.externalId, employee: { externalId: 'N0003' } })
    expect(await getCompletionForEdit(id, options)).toMatchObject({
      imported: false,
      courseCode: 'GDPR',
      completedOn: '2026-09-02',
      validUntil: '2028-09-02',
      provider: `${NAME} dodavatel`,
      price: 300,
      note: 'opraveno',
      employee: { externalId: 'N0003', name: 'Osoba Nová' },
    })
    const imported = await db.courseCompletion.findFirstOrThrow({
      where: { externalId: { startsWith: 'Z' } },
    })
    expect((await getCompletionForEdit(imported.id, options))?.imported).toBe(true)
    await archiveRecord('completion', id, TEST_USER, options)
    expect(await getCompletionForEdit(id, options)).toBeNull()
    await expect(
      updateCompletion(
        id,
        {
          courseCode: 'GDPR',
          completedOn: '2026-09-02',
          validUntil: null,
          provider: null,
          price: null,
          note: null,
        },
        options
      )
    ).rejects.toMatchObject({ code: 'P2025' })
  })
})

describe('departments and positions', () => {
  it('create and rename them, refusing a name an active one has', async () => {
    const created = await createGroup('department', { name: ` ${NAME} nové ` }, options)
    if (!created.ok) throw new Error('not created')
    expect(await getGroupForEdit('department', created.id, options)).toEqual({
      id: created.id,
      name: `${NAME} nové`,
    })
    expect(await createGroup('department', { name: 'Laboratoře' }, options)).toEqual({
      ok: false,
      taken: 'name',
    })
    expect(
      await renameGroup('department', created.id, { name: `${NAME} přejmenované` }, options)
    ).toEqual({ ok: true, id: created.id })
    expect(await renameGroup('department', created.id, { name: 'Marketing' }, options)).toEqual({
      ok: false,
      taken: 'name',
    })
    const position = await createGroup('position', { name: `${NAME} pozice 2` }, options)
    expect(position.ok).toBe(true)
    expect((await listGroupOptions('position', options)).map(p => p.name)).toContain(
      `${NAME} pozice 2`
    )
    await archiveRecord('department', created.id, TEST_USER, options)
    expect(await getGroupForEdit('department', created.id, options)).toBeNull()
    expect((await listGroupOptions('department', options)).map(d => d.id)).not.toContain(created.id)
    await expect(
      renameGroup('department', created.id, { name: `${NAME} znovu` }, options)
    ).rejects.toMatchObject({ code: 'P2025' })
  })
})

describe('booking by hand', () => {
  it('offers sessions ahead with a free seat that the person is not on yet', async () => {
    const before = await listBookableSessions('N0003', options)
    expect(before.length).toBeGreaterThan(0)
    expect(before.every(s => s.free > 0 && s.startsAt > now.toISOString())).toBe(true)
    // T030 and T016 are overbooked in the export: no seat to offer.
    expect(before.map(s => s.externalId)).not.toContain('T030')
    const target = before[0]
    if (!target) throw new Error('no session')
    await applyAssignments(
      [{ sessionExternalId: target.externalId, employeeExternalId: 'N0003', source: 'MANUAL' }],
      TEST_USER,
      options
    )
    const after = await listBookableSessions('N0003', options)
    expect(after.map(s => s.externalId)).not.toContain(target.externalId)
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
    expect(await getUser(TEST_USER, options)).toMatchObject({ bookingsMade: 1 })
    expect(await getUser('nope', options)).toBeNull()
    expect(await canSetUserRole(viewer.id, 'FULL', admin.id, options)).toEqual({
      ok: true,
      clerkId: 'user_it_rec_viewer',
    })
    expect(await setUserRole(viewer.id, 'FULL', admin.id, options)).toEqual({
      ok: true,
      clerkId: 'user_it_rec_viewer',
    })
    expect((await getUser(viewer.id, options))?.role).toBe('FULL')
    for (const change of [canSetUserRole, setUserRole])
      expect(await change(admin.id, 'VIEWER', admin.id, options)).toEqual({
        ok: false,
        reason: 'SELF',
      })
    expect(await setUserRole('nope', 'FULL', admin.id, options)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    })
    expect(await canSetUserRole('nope', 'FULL', admin.id, options)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    })
    // With every other admin archived for the check, Adéla is the last one.
    await db.user.updateMany({
      where: { role: 'ADMIN', archivedAt: null, id: { not: admin.id } },
      data: { archivedAt: now, archivedById: TEST_USER },
    })
    for (const change of [canSetUserRole, setUserRole])
      expect(await change(admin.id, 'FULL', viewer.id, options)).toEqual({
        ok: false,
        reason: 'LAST_ADMIN',
      })
    expect(await setUserRole(viewer.id, 'ADMIN', admin.id, options)).toMatchObject({ ok: true })
    expect(await setUserRole(admin.id, 'FULL', viewer.id, options)).toMatchObject({ ok: true })
  })
})
