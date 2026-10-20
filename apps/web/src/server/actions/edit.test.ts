import {
  createCompletion,
  createCourse,
  createEmployee,
  updateCompletion,
  updateCourse,
  updateEmployee,
  updateSession,
} from '@muni/db/repositories'
import { revalidatePath } from 'next/cache'
import { describe, expect, it, vi } from 'vitest'

import { RateLimitedError, spendRequest } from '@/server/rate-limit'
import { form, idle, redirectOf, serverSession, signedIn } from '@/test/server'

import { saveCompletion, saveCourse, saveEmployee, saveSession } from './edit'

vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkClient: vi.fn(),
  clerkMiddleware: vi.fn((handler: unknown) => handler),
}))

vi.mock('@muni/db/repositories', async () =>
  (await import('@/test/repositories-mock')).repositoriesMock()
)

vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))

vi.mock('@muni/db/reference', () => ({ findArchivedKeys: vi.fn() }))

vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

serverSession()

describe('edit actions', () => {
  const audience = { requiredForAll: false, departmentIds: [], positionIds: [] }

  it('save a course with who must hold it, and go back to it', async () => {
    vi.mocked(updateCourse).mockResolvedValue({ ok: true, code: 'BOZP-Z' })
    const data = form({ name: 'BOZP', validityMonths: '24', requiredForAll: 'on' })
    data.append('departmentIds', 'dep_lab')
    data.append('positionIds', 'pos_head')
    expect(await redirectOf(saveCourse('BOZP-Z', idle, data))).toBe('/courses/BOZP-Z')
    expect(updateCourse).toHaveBeenCalledWith('BOZP-Z', {
      name: 'BOZP',
      validityMonths: 24,
      requiredForAll: true,
      departmentIds: ['dep_lab'],
      positionIds: ['pos_head'],
      sessionMinutes: null,
      seats: null,
      // Not chosen: the needs follow what the sessions import derives.
      onlineAllowed: false,
      capabilities: [],
    })
    // The browser refreshes its own read cache; no server route is refreshed.
    expect(revalidatePath).not.toHaveBeenCalled()
    // Online is a checkbox: ticked, it may be held online.
    await redirectOf(saveCourse('BOZP-Z', idle, form({ name: 'BOZP', onlineAllowed: 'on' })))
    expect(updateCourse).toHaveBeenLastCalledWith(
      'BOZP-Z',
      expect.objectContaining({ onlineAllowed: true })
    )
  })

  it('say how many planned sessions a course change would strand', async () => {
    vi.mocked(updateCourse).mockResolvedValueOnce({
      ok: false,
      field: 'onlineAllowed',
      reason: 'sessions_unfit',
      count: 2,
    })
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toEqual({
      status: 'error',
      fieldErrors: { onlineAllowed: 'sessions_unfit' },
      values: { onlineAllowed: { count: 2 } },
    })
  })

  it('create a course with its code upper-cased, and say when the code is taken', async () => {
    vi.mocked(createCourse).mockResolvedValueOnce({ ok: true, code: 'NOVY-1' })
    expect(await redirectOf(saveCourse(null, idle, form({ code: 'novy-1', name: 'Nový' })))).toBe(
      '/courses/NOVY-1'
    )
    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOVY-1', name: 'Nový', ...audience })
    )
    vi.mocked(createCourse).mockResolvedValueOnce({ ok: false, field: 'code', reason: 'taken' })
    expect(await saveCourse(null, idle, form({ code: 'BOZP-Z', name: 'Nový' }))).toEqual({
      status: 'error',
      fieldErrors: { code: 'taken' },
    })
    expect(await saveCourse(null, idle, form({ code: 'špatný kód', name: 'Nový' }))).toMatchObject({
      fieldErrors: { code: 'invalid_code' },
    })
    vi.mocked(createCourse).mockRejectedValueOnce(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await saveCourse(null, idle, form({ code: 'NOVY-2', name: 'Nový' }))).toMatchObject({
      formError: 'generic',
    })
  })

  it('say when a department chosen for a course is gone', async () => {
    vi.mocked(updateCourse).mockResolvedValueOnce({
      ok: false,
      field: 'departmentIds',
      reason: 'not_found',
    })
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toEqual({
      status: 'error',
      fieldErrors: { departmentIds: 'unavailable' },
    })
  })

  it('return field errors instead of saving invalid input', async () => {
    expect(await saveCourse('BOZP-Z', idle, form({ name: '', validityMonths: 'dva' }))).toEqual({
      status: 'error',
      fieldErrors: { name: 'required', validityMonths: 'not_a_number' },
    })
    expect(updateCourse).not.toHaveBeenCalled()
  })

  it('report a record that disappeared, and anything else as a generic failure', async () => {
    vi.mocked(updateCourse).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveCourse('GONE', idle, form({ name: 'BOZP' }))).toMatchObject({
      formError: 'not_found',
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(updateCourse).mockRejectedValueOnce(new Error('connection lost'))
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toMatchObject({
      formError: 'generic',
    })
    expect(log).toHaveBeenCalled()
  })

  it('refuse visitors and readers before reading the form, without throwing', async () => {
    for (const user of [null, 'user_2'] as const) {
      signedIn(user, 'FULL')
      expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toEqual({
        status: 'error',
        fieldErrors: {},
        formError: 'unauthorized',
      })
    }
    expect(updateCourse).not.toHaveBeenCalled()
  })

  it('refuse past the write limit, and an id that did not come back as one', async () => {
    vi.mocked(spendRequest).mockRejectedValueOnce(new RateLimitedError(30))
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toMatchObject({
      formError: 'rate_limited',
    })
    // A bound id is the browser's to send back: an object is no id.
    expect(
      await saveSession({ contains: '' } as never, idle, form({ name: 'BOZP' }))
    ).toMatchObject({ formError: 'not_found' })
    expect(updateSession).not.toHaveBeenCalled()
  })

  const sessionForm = {
    courseId: 'course_bozp',
    providerId: 'prv_internal',
    date: '2026-11-04',
    startTime: '08:00',
    roomId: 'room_aula_a',
    capacity: '30',
  }

  it('save a session and show it', async () => {
    vi.mocked(updateSession).mockResolvedValue({
      ok: true,
      externalId: 'T016',
      courseCode: 'BOZP-Z',
    })
    expect(await redirectOf(saveSession('T016', idle, form(sessionForm)))).toBe('/sessions/T016')
    expect(updateSession).toHaveBeenCalledWith(
      'T016',
      expect.objectContaining({
        courseId: 'course_bozp',
        providerId: 'prv_internal',
        roomId: 'room_aula_a',
        unnamedBookings: 0,
      })
    )
    expect(await saveSession('T016', idle, form({ ...sessionForm, providerId: '' }))).toMatchObject(
      { fieldErrors: { providerId: 'required' } }
    )
    vi.mocked(updateSession).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveSession('T999', idle, form(sessionForm))).toMatchObject({
      formError: 'not_found',
    })
    // The room refuses it: the reason goes on the field to change.
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'ROOM_BUSY' })
    expect(await saveSession('T016', idle, form(sessionForm))).toEqual({
      status: 'error',
      fieldErrors: { roomId: 'room_busy' },
    })
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'ROOM_TOO_SMALL' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { capacity: 'room_too_small' },
    })
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'OVER_CAPACITY' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { capacity: 'over_capacity' },
    })
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'COURSE_ARCHIVED' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { courseId: 'course_archived' },
    })
    // What follows from the course and the provider: a length to end by, an offering.
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'NO_LENGTH' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { courseId: 'no_length' },
    })
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'NOT_OFFERED' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { providerId: 'not_offered' },
    })
    // More unnamed seats than seats: said before asking the database.
    expect(
      await saveSession('T016', idle, form({ ...sessionForm, unnamedBookings: '31' }))
    ).toMatchObject({ fieldErrors: { capacity: 'over_capacity' } })
  })

  const employeeForm = {
    firstName: 'Marie',
    lastName: 'Černá',
    email: 'Marie.Cerna@Vzorova.example',
    departmentId: 'dep_lab',
    managerId: 'emp_E0001',
    hiredOn: '2019-03-01',
    status: 'ACTIVE',
  }

  it('save a person, lower-casing the email, with their department and manager', async () => {
    vi.mocked(updateEmployee).mockResolvedValue({ ok: true, externalId: 'E0153' })
    expect(await redirectOf(saveEmployee('E0153', idle, form(employeeForm)))).toBe(
      '/employees/E0153'
    )
    expect(updateEmployee).toHaveBeenCalledWith(
      'E0153',
      expect.objectContaining({
        email: 'marie.cerna@vzorova.example',
        departmentId: 'dep_lab',
        positionId: null,
        managerId: 'emp_E0001',
        leadsDepartment: false,
        nationalId: null,
      })
    )
    await redirectOf(saveEmployee('E0153', idle, form({ ...employeeForm, leadsDepartment: 'on' })))
    expect(updateEmployee).toHaveBeenLastCalledWith(
      'E0153',
      expect.objectContaining({ leadsDepartment: true })
    )
    // Leading a department means being in one.
    expect(
      await saveEmployee(
        'E0153',
        idle,
        form({ ...employeeForm, departmentId: '', leadsDepartment: 'on' })
      )
    ).toMatchObject({ fieldErrors: { leadsDepartment: 'no_department' } })
    expect(
      await saveEmployee('E0153', idle, form({ ...employeeForm, email: '', leftOn: '2010-01-01' }))
    ).toMatchObject({ fieldErrors: { leftOn: 'before_hired' } })
    expect(
      await saveEmployee('E0153', idle, form({ ...employeeForm, nationalId: '123' }))
    ).toMatchObject({ fieldErrors: { nationalId: 'invalid_national_id' } })
    vi.mocked(updateEmployee).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveEmployee('E9999', idle, form(employeeForm))).toMatchObject({
      formError: 'not_found',
    })
  })

  it('add a person and show them; refusals name the field', async () => {
    vi.mocked(createEmployee).mockResolvedValueOnce({ ok: true, externalId: 'N0001' })
    expect(await redirectOf(saveEmployee(null, idle, form(employeeForm)))).toBe('/employees/N0001')
    for (const [problem, key] of [
      [{ field: 'email', reason: 'taken' }, 'taken'],
      [{ field: 'managerId', reason: 'manager_cycle' }, 'manager_cycle'],
      [{ field: 'positionId', reason: 'not_found' }, 'unavailable'],
      [{ field: 'positionId', reason: 'pair_unknown' }, 'pair_unknown'],
    ] as const) {
      vi.mocked(createEmployee).mockResolvedValueOnce({ ok: false, ...problem })
      expect(await saveEmployee(null, idle, form(employeeForm))).toEqual({
        status: 'error',
        fieldErrors: { [problem.field]: key },
      })
    }
  })

  const completionForm = {
    employeeId: 'emp_E0153',
    courseId: 'course_bozp',
    completedOn: '2026-10-01',
    providerId: 'prov_vzor',
  }

  it('record a completion and show its person; the server works out an empty validity', async () => {
    vi.mocked(createCompletion).mockResolvedValue({ ok: true, employeeExternalId: 'E0153' })
    expect(await redirectOf(saveCompletion(null, idle, form(completionForm)))).toBe(
      '/employees/E0153'
    )
    expect(createCompletion).toHaveBeenLastCalledWith({
      employeeId: 'emp_E0153',
      courseId: 'course_bozp',
      completedOn: '2026-10-01',
      validUntil: null,
      providerId: 'prov_vzor',
      newProviderName: null,
      price: null,
      note: null,
    })
    await redirectOf(
      saveCompletion(
        null,
        idle,
        form({ ...completionForm, validUntil: '2027-01-01', price: '1 200 Kč' })
      )
    )
    expect(createCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({ validUntil: '2027-01-01', price: 1200 })
    )
  })

  it('name a new provider only on purpose', async () => {
    vi.mocked(createCompletion).mockResolvedValue({ ok: true, employeeExternalId: 'E0153' })
    await redirectOf(
      saveCompletion(
        null,
        idle,
        form({ ...completionForm, providerId: 'new', newProviderName: 'Nová firma' })
      )
    )
    expect(createCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({ providerId: null, newProviderName: 'Nová firma' })
    )
    // A name typed while a provider is picked is not sent.
    await redirectOf(
      saveCompletion(null, idle, form({ ...completionForm, newProviderName: 'Ignorováno' }))
    )
    expect(createCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({ providerId: 'prov_vzor', newProviderName: null })
    )
    expect(
      await saveCompletion(null, idle, form({ ...completionForm, providerId: 'new' }))
    ).toEqual({ status: 'error', fieldErrors: { newProviderName: 'required' } })
    vi.mocked(createCompletion).mockResolvedValueOnce({
      ok: false,
      field: 'newProviderName',
      reason: 'taken',
    })
    expect(
      await saveCompletion(
        null,
        idle,
        form({ ...completionForm, providerId: 'new', newProviderName: 'vzorový ústav' })
      )
    ).toEqual({ status: 'error', fieldErrors: { newProviderName: 'taken' } })
  })

  it('correct a completion in place, and show the person it now belongs to', async () => {
    vi.mocked(updateCompletion).mockResolvedValue({ ok: true, employeeExternalId: 'E0001' })
    expect(await redirectOf(saveCompletion('cmp_1', idle, form(completionForm)))).toBe(
      '/employees/E0001'
    )
    expect(updateCompletion).toHaveBeenCalledWith(
      'cmp_1',
      expect.objectContaining({ courseId: 'course_bozp' })
    )
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('refuse a completion of an unknown course or with bad dates', async () => {
    vi.mocked(createCompletion).mockResolvedValueOnce({
      ok: false,
      field: 'courseId',
      reason: 'not_found',
    })
    expect(await saveCompletion(null, idle, form(completionForm))).toEqual({
      status: 'error',
      fieldErrors: { courseId: 'unavailable' },
    })
    expect(
      await saveCompletion(null, idle, form({ ...completionForm, validUntil: '2020-01-01' }))
    ).toMatchObject({ fieldErrors: { validUntil: 'before_completed' } })
    vi.mocked(createCompletion).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveCompletion(null, idle, form(completionForm))).toMatchObject({
      formError: 'not_found',
    })
  })
})
