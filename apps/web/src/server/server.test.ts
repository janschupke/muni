import { auth } from '@clerk/nextjs/server'
import {
  applyAssignments,
  createCompletion,
  createRoom,
  createSession,
  deleteRoom,
  getCourseForEdit,
  updateRoom,
  moveSeats,
  removeAssignment,
  updateCourse,
  updateEmployee,
  updateSession,
} from '@muni/db/repositories'
import { CommitValidationError, commitChunk } from '@muni/db/writer'
import { revalidatePath } from 'next/cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { commitImportChunk } from '@/features/import/actions'
import getRequestConfig from '@/i18n/request'
import {
  NotFoundError,
  RedirectError,
  requestCookies,
  requestHeaders,
  responseCookies,
} from '@/test/next'
import { courseForEdit } from '@/test/fixtures'

import {
  applyAssignmentsAction,
  moveSeatsAction,
  removeAssignmentAction,
} from './actions/assignments'
import { recordCompletion, saveCourse, saveEmployee, saveSession } from './actions/edit'
import { removeRoom, saveRoom } from './actions/rooms'
import { createOfferedSession, saveNewSession } from './actions/sessions'
import { setLocale } from './actions/locale'
import { getViewer, requirePageUser, requireUser } from './auth'

const clerk = vi.hoisted(() => ({ enabled: true }))
vi.mock('./clerk', () => ({
  get clerkEnabled() {
    return clerk.enabled
  },
}))
vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkMiddleware: vi.fn(() => 'clerk middleware'),
}))
vi.mock('@muni/db/repositories', () => ({
  applyAssignments: vi.fn(),
  createCompletion: vi.fn(),
  createRoom: vi.fn(),
  createSession: vi.fn(),
  deleteRoom: vi.fn(),
  updateRoom: vi.fn(),
  getCourseForEdit: vi.fn(),
  moveSeats: vi.fn(),
  removeAssignment: vi.fn(),
  updateCourse: vi.fn(),
  updateEmployee: vi.fn(),
  updateSession: vi.fn(),
}))
vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))
vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

type AuthResult = Awaited<ReturnType<typeof auth>>
const signedIn = (userId: string | null) => {
  vi.mocked(auth).mockResolvedValue({ userId } as AuthResult)
}

beforeEach(() => {
  clerk.enabled = true
  signedIn('user_1')
  vi.mocked(auth.protect).mockResolvedValue({ userId: 'user_1' } as never)
})
afterEach(() => {
  vi.clearAllMocks()
})

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const idle = { status: 'idle' } as const

/** Runs an action that ends in a redirect; returns where it went. */
async function redirectOf(action: Promise<unknown>): Promise<string> {
  const error = await action.catch((e: unknown) => e)
  if (!(error instanceof RedirectError))
    throw new Error(`expected a redirect, got ${String(error)}`)
  return error.url
}

describe('auth', () => {
  it('without Clerk, everyone is a visitor and protected pages do not exist', async () => {
    clerk.enabled = false
    expect(await getViewer()).toBe('anonymous')
    await expect(requirePageUser()).rejects.toThrow(NotFoundError)
    await expect(requireUser()).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })

  it('with Clerk, signing in is the only distinction', async () => {
    expect(await getViewer()).toBe('authenticated')
    expect(await requireUser()).toBe('user_1')
    expect(await requirePageUser()).toBe('user_1')
    signedIn(null)
    expect(await getViewer()).toBe('anonymous')
    await expect(requireUser()).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })
})

describe('edit actions', () => {
  it('save a course and go back to it', async () => {
    expect(
      await redirectOf(saveCourse('BOZP-Z', idle, form({ name: 'BOZP', validityMonths: '24' })))
    ).toBe('/courses/BOZP-Z')
    expect(updateCourse).toHaveBeenCalledWith('BOZP-Z', {
      name: 'BOZP',
      validityMonths: 24,
      sessionMinutes: null,
      groupSize: null,
      onlineAllowed: false,
      capabilities: [],
    })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('return field errors instead of saving invalid input', async () => {
    expect(await saveCourse('BOZP-Z', idle, form({ name: '', validityMonths: 'dva' }))).toEqual({
      status: 'error',
      fieldErrors: { name: 'required', validityMonths: 'invalid_type' },
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

  it('refuse visitors before reading the form', async () => {
    signedIn(null)
    await expect(saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).rejects.toMatchObject({
      name: 'UnauthorizedError',
    })
  })

  const sessionForm = {
    date: '2026-11-04',
    startTime: '08:00',
    endTime: '11:00',
    roomId: 'room_aula_a',
    capacity: '30',
    pricePerPerson: '450,50 Kč',
    status: 'PLANNED',
  }

  it('save a session and return to its course', async () => {
    vi.mocked(updateSession).mockResolvedValue({
      ok: true,
      externalId: 'T016',
      courseCode: 'BOZP-Z',
    })
    expect(await redirectOf(saveSession('T016', idle, form(sessionForm)))).toBe('/courses/BOZP-Z')
    expect(updateSession).toHaveBeenCalledWith(
      'T016',
      expect.objectContaining({ roomId: 'room_aula_a', unnamedBookings: 0, pricePerPerson: 450.5 })
    )
    expect(
      await saveSession('T016', idle, form({ ...sessionForm, endTime: '07:00' }))
    ).toMatchObject({ fieldErrors: { endTime: 'before_start' } })
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
  })

  const employeeForm = {
    firstName: 'Marie',
    lastName: 'Černá',
    email: 'Marie.Cerna@Vzorova.example',
    hiredOn: '2019-03-01',
    status: 'ACTIVE',
  }

  it('save a person, lower-casing the email', async () => {
    expect(await redirectOf(saveEmployee('E0153', idle, form(employeeForm)))).toBe(
      '/employees/E0153'
    )
    expect(updateEmployee).toHaveBeenCalledWith(
      'E0153',
      expect.objectContaining({ email: 'marie.cerna@vzorova.example', department: null })
    )
    expect(
      await saveEmployee('E0153', idle, form({ ...employeeForm, email: '', leftOn: '2010-01-01' }))
    ).toMatchObject({ fieldErrors: { leftOn: 'before_hired' } })
    vi.mocked(updateEmployee).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveEmployee('E9999', idle, form(employeeForm))).toMatchObject({
      formError: 'not_found',
    })
  })

  const completionForm = { courseCode: 'BOZP-Z', completedOn: '2026-10-01' }

  it('derive the validity from the course, on the server', async () => {
    vi.mocked(getCourseForEdit).mockResolvedValue(courseForEdit())
    expect(await redirectOf(recordCompletion('E0153', idle, form(completionForm)))).toBe(
      '/employees/E0153'
    )
    expect(createCompletion).toHaveBeenLastCalledWith(
      'E0153',
      expect.objectContaining({ validUntil: '2028-10-01' })
    )
    // A date the user entered wins; a course that never expires gives none.
    await redirectOf(
      recordCompletion(
        'E0153',
        idle,
        form({ ...completionForm, validUntil: '2027-01-01', price: '1 200 Kč' })
      )
    )
    expect(createCompletion).toHaveBeenLastCalledWith(
      'E0153',
      expect.objectContaining({ validUntil: '2027-01-01', price: 1200 })
    )
    vi.mocked(getCourseForEdit).mockResolvedValue(
      courseForEdit({ code: 'LEAD', name: 'LEAD', validityMonths: null })
    )
    await redirectOf(
      recordCompletion('E0153', idle, form({ ...completionForm, courseCode: 'LEAD' }))
    )
    expect(createCompletion).toHaveBeenLastCalledWith(
      'E0153',
      expect.objectContaining({ validUntil: null })
    )
  })

  it('refuse a completion of an unknown course or with bad dates', async () => {
    vi.mocked(getCourseForEdit).mockResolvedValue(null)
    expect(await recordCompletion('E0153', idle, form(completionForm))).toEqual({
      status: 'error',
      fieldErrors: { courseCode: 'invalid_format' },
    })
    expect(
      await recordCompletion('E0153', idle, form({ ...completionForm, validUntil: '2020-01-01' }))
    ).toMatchObject({ fieldErrors: { validUntil: 'before_completed' } })
    vi.mocked(getCourseForEdit).mockResolvedValue(courseForEdit())
    vi.mocked(createCompletion).mockRejectedValueOnce({ code: 'P2025' })
    expect(await recordCompletion('E9999', idle, form(completionForm))).toMatchObject({
      formError: 'not_found',
    })
  })
})

describe('booking actions', () => {
  const pair = { sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'ADVISOR' }

  it('save bookings as the signed-in user and report each refusal', async () => {
    vi.mocked(applyAssignments).mockResolvedValue([
      { request: { ...pair, source: 'ADVISOR' }, ok: true },
      {
        request: { ...pair, employeeExternalId: 'E0002', source: 'ADVISOR' },
        ok: false,
        reason: 'SESSION_FULL',
      },
    ])
    expect(await applyAssignmentsAction([pair, { ...pair, employeeExternalId: 'E0002' }])).toEqual({
      applied: 1,
      failed: [{ sessionExternalId: 'T018', employeeExternalId: 'E0002', reason: 'SESSION_FULL' }],
    })
    expect(applyAssignments).toHaveBeenCalledWith(expect.any(Array), 'user_1')
    await expect(applyAssignmentsAction([])).rejects.toThrow()
    await expect(applyAssignmentsAction([{ ...pair, score: 1, source: 'GUESS' }])).rejects.toThrow()
  })

  it('cancel a booking and move seats', async () => {
    vi.mocked(removeAssignment).mockResolvedValue(true)
    expect(
      await removeAssignmentAction({ sessionExternalId: 'T018', employeeExternalId: 'E0153' })
    ).toBe(true)
    vi.mocked(moveSeats).mockResolvedValue({ ok: false, reason: 'TARGET_FULL' })
    expect(await moveSeatsAction({ from: 'T016', to: 'T018', count: 1 })).toEqual({
      ok: false,
      reason: 'TARGET_FULL',
    })
    await expect(moveSeatsAction({ from: 'T016', to: 'T018', count: 0 })).rejects.toThrow()
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })
})

describe('locale', () => {
  it('stores a supported language for a year and ignores anything else', async () => {
    await setLocale('xx')
    expect(responseCookies).toEqual([])
    await setLocale('en')
    expect(responseCookies).toEqual([
      {
        name: 'NEXT_LOCALE',
        value: 'en',
        options: { path: '/', maxAge: 31_536_000, sameSite: 'lax' },
      },
    ])
  })

  it('resolves the request language from the cookie, then the browser, then Czech', async () => {
    const config = getRequestConfig as unknown as () => Promise<{
      locale: string
      timeZone: string
    }>
    expect((await config()).locale).toBe('cs')
    requestHeaders.set('accept-language', 'en-GB,en;q=0.9')
    expect(await config()).toMatchObject({ locale: 'en', timeZone: 'Europe/Prague' })
    requestCookies.set('NEXT_LOCALE', 'cs')
    expect((await config()).locale).toBe('cs')
  })
})

describe('import commit', () => {
  const course = { code: 'BOZP-Z', name: 'BOZP', validityMonths: 24, requirements: [] }

  it('writes a chunk for a signed-in user', async () => {
    vi.mocked(commitChunk).mockResolvedValue({ created: 1, updated: 0 })
    expect(await commitImportChunk('courses', [course])).toEqual({
      ok: true,
      created: 1,
      updated: 0,
    })
    expect(commitChunk).toHaveBeenCalledWith('db', 'courses', [course])
  })

  it('refuses visitors, unknown datasets and oversized chunks', async () => {
    signedIn(null)
    expect(await commitImportChunk('courses', [course])).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    signedIn('user_1')
    expect(await commitImportChunk('pets' as never, [])).toEqual({ ok: false, error: 'invalid' })
    expect(await commitImportChunk('courses', 'x' as never)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(
      await commitImportChunk(
        'courses',
        Array.from({ length: 501 }, () => course)
      )
    ).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('names the first invalid record, and hides other failures', async () => {
    vi.mocked(commitChunk).mockRejectedValueOnce(
      new CommitValidationError(3, [{ code: 'custom', message: 'before_start', path: [] } as never])
    )
    expect(await commitImportChunk('sessions', [course])).toEqual({
      ok: false,
      error: 'invalid',
      detail: '#3: before_start',
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(commitChunk).mockRejectedValueOnce(new Error('deadlock'))
    expect(await commitImportChunk('sessions', [course])).toEqual({ ok: false, error: 'failed' })
    expect(log).toHaveBeenCalled()
  })
})

describe('proxy', () => {
  it('attaches Clerk only when it is configured', async () => {
    vi.resetModules()
    clerk.enabled = true
    expect((await import('@/proxy')).default).toBe('clerk middleware')
    vi.resetModules()
    clerk.enabled = false
    const { default: passThrough, config } = await import('@/proxy')
    const response = (passThrough as () => Response)()
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(config.matcher).toHaveLength(2)
  })
})

describe('room actions', () => {
  const roomForm = {
    name: 'Laboratoř 4',
    kind: 'LAB',
    capacity: '16',
    note: '',
  }
  const withEquipment = () => {
    const data = form(roomForm)
    data.append('capabilities', 'LAB_EQUIPMENT')
    data.append('capabilities', 'PROJECTOR')
    return data
  }

  it('create a room or save one, then show it', async () => {
    vi.mocked(createRoom).mockResolvedValue({ id: 'room_new' })
    expect(await redirectOf(saveRoom(null, idle, withEquipment()))).toBe('/rooms/room_new')
    expect(createRoom).toHaveBeenCalledWith({
      name: 'Laboratoř 4',
      kind: 'LAB',
      capacity: 16,
      capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
      note: null,
    })
    vi.mocked(updateRoom).mockResolvedValue({ id: 'room_lab' })
    expect(await redirectOf(saveRoom('room_lab', idle, form(roomForm)))).toBe('/rooms/room_lab')
    expect(updateRoom).toHaveBeenCalledWith(
      'room_lab',
      expect.objectContaining({ capabilities: [] })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('name what is wrong: a missing name, a name in use, a room that is gone', async () => {
    expect(await saveRoom(null, idle, form({ ...roomForm, name: '' }))).toMatchObject({
      fieldErrors: { name: 'required' },
    })
    vi.mocked(createRoom).mockRejectedValueOnce({ code: 'P2002' })
    expect(await saveRoom(null, idle, form(roomForm))).toEqual({
      status: 'error',
      fieldErrors: { name: 'taken' },
    })
    vi.mocked(updateRoom).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveRoom('gone', idle, form(roomForm))).toMatchObject({ formError: 'not_found' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(updateRoom).mockRejectedValueOnce(new Error('down'))
    expect(await saveRoom('room_lab', idle, form(roomForm))).toMatchObject({ formError: 'generic' })
  })

  it('delete a room only while nothing is held there', async () => {
    vi.mocked(deleteRoom).mockResolvedValueOnce('IN_USE')
    expect(await removeRoom('room_aula_a', idle)).toMatchObject({ formError: 'in_use' })
    vi.mocked(deleteRoom).mockResolvedValueOnce('DELETED')
    expect(await redirectOf(removeRoom('room_new', idle))).toBe('/rooms')
    vi.mocked(deleteRoom).mockRejectedValueOnce({ code: 'P2025' })
    expect(await removeRoom('gone', idle)).toMatchObject({ formError: 'not_found' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(deleteRoom).mockRejectedValueOnce(new Error('down'))
    expect(await removeRoom('room_new', idle)).toMatchObject({ formError: 'generic' })
    signedIn(null)
    await expect(removeRoom('room_new', idle)).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })
})

describe('session creation', () => {
  const create = {
    courseCode: 'POZ-OCH',
    date: '2026-10-19',
    startTime: '10:00',
    endTime: '12:00',
    roomId: 'room_aula_a',
    capacity: 40,
    pricePerPerson: null,
    status: 'PLANNED' as const,
  }

  it('creates an offered session and reports its id, or why it could not', async () => {
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      externalId: 'S001',
      courseCode: 'POZ-OCH',
    })
    expect(await createOfferedSession(create)).toEqual({ ok: true, externalId: 'S001' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(await createOfferedSession({ ...create, endTime: '09:00' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    vi.mocked(createSession).mockResolvedValueOnce({ ok: false, problem: 'ROOM_BUSY' })
    expect(await createOfferedSession(create)).toEqual({ ok: false, reason: 'ROOM_BUSY' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(createSession).mockRejectedValueOnce(new Error('down'))
    expect(await createOfferedSession(create)).toEqual({ ok: false, reason: 'failed' })
    // Signed out meanwhile: a reason to show, not an error page.
    signedIn(null)
    expect(await createOfferedSession(create)).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('creates a session from the course page form and opens it', async () => {
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      externalId: 'S002',
      courseCode: 'POZ-OCH',
    })
    const fields = {
      date: '2026-11-02',
      startTime: '10:00',
      endTime: '12:00',
      roomId: 'room_aula_a',
      capacity: '40',
      pricePerPerson: '380,- Kč',
      status: 'PLANNED',
    }
    expect(await redirectOf(saveNewSession('POZ-OCH', idle, form(fields)))).toBe('/sessions/S002')
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ courseCode: 'POZ-OCH', capacity: 40, pricePerPerson: 380 })
    )
    expect(await saveNewSession('POZ-OCH', idle, form({ ...fields, roomId: '' }))).toMatchObject({
      fieldErrors: { roomId: 'required' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(createSession).mockRejectedValueOnce(new Error('down'))
    expect(await saveNewSession('POZ-OCH', idle, form(fields))).toMatchObject({
      formError: 'generic',
    })
    vi.mocked(createSession).mockResolvedValueOnce({
      ok: false,
      problem: 'ROOM_MISSING_CAPABILITIES',
    })
    expect(await saveNewSession('POZ-OCH', idle, form(fields))).toMatchObject({
      fieldErrors: { roomId: 'room_missing_capabilities' },
    })
  })
})
