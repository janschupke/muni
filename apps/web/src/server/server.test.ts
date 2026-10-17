import { auth, clerkClient, clerkMiddleware } from '@clerk/nextjs/server'
import { findArchivedKeys } from '@muni/db/reference'
import {
  applyAssignments,
  archiveImpact,
  archiveRecord,
  checkSessionSlot,
  createCompletion,
  createCourse,
  createEmployee,
  createProvider,
  createRoom,
  createSession,
  createSessionWithBookings,
  findUserByClerkId,
  moveSeatsMany,
  raiseCapacity,
  removeAssignment,
  revertUserRole,
  saveDepartment,
  savePosition,
  setUserRole,
  unarchiveRecord,
  updateCompletion,
  updateCourse,
  updateEmployee,
  updateProvider,
  updateRoom,
  updateSession,
  upsertUserFromClerk,
  type UserRecord,
} from '@muni/db/repositories'
import { commitChunk, CommitRefusedError, CommitValidationError } from '@muni/db/writer'
import type { Role } from '@muni/domain/enums'
import { NO_ARCHIVED } from '@muni/importer'
import { revalidatePath } from 'next/cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { commitImportChunk, findArchived } from '@/features/import/actions'
import getRequestConfig from '@/i18n/request'
import {
  NotFoundError,
  RedirectError,
  requestCookies,
  requestHeaders,
  responseCookies,
} from '@/test/next'

import { archiveAction, previewArchive, unarchiveAction } from './actions/archive'
import {
  addBookingAction,
  applyAssignmentsAction,
  removeAssignmentAction,
  resolveOverbookingAction,
} from './actions/assignments'
import { saveCompletion, saveCourse, saveEmployee, saveSession } from './actions/edit'
import { saveDepartmentAction, savePositionAction } from './actions/groups'
import { setLocale } from './actions/locale'
import { saveProvider } from './actions/providers'
import { saveRoom } from './actions/rooms'
import {
  checkSessionSlotAction,
  createPlannedSessionAction,
  saveNewSession,
} from './actions/sessions'
import { saveUserRole } from './actions/users'
import {
  getSessionUser,
  isAccountArchived,
  requireAdmin,
  requireAdminPage,
  requireReader,
  SYNC_INTERVAL_MS,
} from './auth'
import { RateLimitedError, spendRequest } from './rate-limit'

vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkClient: vi.fn(),
  clerkMiddleware: vi.fn((handler: unknown) => handler),
}))
vi.mock('@muni/db/repositories', () => ({
  isPrismaCode: (error: unknown, code: string) =>
    (error as { code?: unknown } | null)?.code === code,
  applyAssignments: vi.fn(),
  archiveImpact: vi.fn(),
  archiveRecord: vi.fn(),
  unarchiveRecord: vi.fn(),
  revertUserRole: vi.fn(),
  setUserRole: vi.fn(),
  createCourse: vi.fn(),
  createEmployee: vi.fn(),
  saveDepartment: vi.fn(),
  savePosition: vi.fn(),
  checkSessionSlot: vi.fn(),
  updateCompletion: vi.fn(),
  createCompletion: vi.fn(),
  createProvider: vi.fn(),
  createRoom: vi.fn(),
  createSession: vi.fn(),
  findUserByClerkId: vi.fn(),
  updateProvider: vi.fn(),
  updateRoom: vi.fn(),
  moveSeatsMany: vi.fn(),
  raiseCapacity: vi.fn(),
  createSessionWithBookings: vi.fn(),
  removeAssignment: vi.fn(),
  updateCourse: vi.fn(),
  updateEmployee: vi.fn(),
  updateSession: vi.fn(),
  upsertUserFromClerk: vi.fn(),
}))
vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))
vi.mock('@muni/db/reference', () => ({ findArchivedKeys: vi.fn() }))
vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

type AuthResult = Awaited<ReturnType<typeof auth>>

/** A users row for `clerkId`, synced just now in session `sess_1`. */
const userRow = (clerkId: string, role: Role, overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: clerkId.replace('user_', 'usr_'),
  clerkId,
  email: `${clerkId}@example.com`,
  name: clerkId,
  role,
  lastSessionId: 'sess_1',
  lastSignInAt: null,
  syncedAt: new Date(),
  archived: false,
  ...overrides,
})

/** Signs in `clerkId` with a fresh users row of `role` (no Clerk call needed), or signs out. */
const signedIn = (clerkId: string | null, role: Role = 'ADMIN') => {
  vi.mocked(auth).mockResolvedValue({
    userId: clerkId,
    sessionId: clerkId && 'sess_1',
  } as AuthResult)
  vi.mocked(findUserByClerkId).mockResolvedValue(clerkId ? userRow(clerkId, role) : null)
}

/** Clerk's backend client: one user, whose public metadata holds `role`. */
const clerkUsers = {
  getUser: vi.fn(),
  updateUserMetadata: vi.fn(),
}
const clerkHas = (role: unknown) => {
  clerkUsers.getUser.mockResolvedValue({
    publicMetadata: role === undefined ? {} : { role },
    primaryEmailAddress: { emailAddress: 'jana@example.com' },
    fullName: 'Jana Nová',
    username: null,
    lastSignInAt: Date.parse('2026-10-16T09:00:00Z'),
    updatedAt: Date.parse('2026-10-16T08:00:00Z'),
  })
}

beforeEach(() => {
  signedIn('user_1')
  vi.mocked(auth.protect).mockResolvedValue({ userId: 'user_1' } as never)
  vi.mocked(clerkClient).mockResolvedValue({ users: clerkUsers } as never)
  vi.mocked(upsertUserFromClerk).mockImplementation(sync =>
    Promise.resolve(
      userRow(sync.clerkId, sync.role, {
        email: sync.email,
        name: sync.name,
        lastSessionId: sync.sessionId,
        lastSignInAt: sync.lastSignInAt,
        syncedAt: sync.syncedAt,
      })
    )
  )
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
/**
 * Where an action or guard sends the user: a guard redirects (throws), a save answers with
 * the page to show next (`saved` / `done` with `href`), which the browser then opens.
 */
async function redirectOf(action: Promise<unknown>): Promise<string> {
  const outcome = await action.catch((e: unknown) => e)
  if (outcome instanceof RedirectError) return outcome.url
  const state = outcome as { status?: unknown; href?: unknown } | null
  if ((state?.status === 'saved' || state?.status === 'done') && typeof state.href === 'string')
    return state.href
  throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`)
}

describe('session user', () => {
  it('is null for visitors, without touching the database', async () => {
    signedIn(null)
    expect(await getSessionUser()).toBeNull()
    expect(findUserByClerkId).not.toHaveBeenCalled()
  })

  it('reads a fresh row from the database, without asking Clerk', async () => {
    signedIn('user_1', 'FULL')
    expect(await getSessionUser()).toEqual({
      id: 'usr_1',
      clerkId: 'user_1',
      role: 'FULL',
      name: 'user_1',
      email: 'user_1@example.com',
    })
    expect(clerkClient).not.toHaveBeenCalled()
  })

  it('on a first sign-in, gives a user without a role the viewer role, in Clerk and the row', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkHas(undefined)
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER', name: 'Jana Nová' })
    expect(clerkUsers.updateUserMetadata).toHaveBeenCalledWith('user_1', {
      publicMetadata: { role: 'viewer' },
    })
    expect(upsertUserFromClerk).toHaveBeenCalledWith({
      clerkId: 'user_1',
      email: 'jana@example.com',
      name: 'Jana Nová',
      role: 'VIEWER',
      sessionId: 'sess_1',
      lastSignInAt: new Date('2026-10-16T09:00:00Z'),
      clerkUpdatedAt: new Date('2026-10-16T08:00:00Z'),
      syncedAt: expect.any(Date) as Date,
    })
  })

  it.each([
    ['an unknown role', 'owner', 'VIEWER', 'viewer'],
    ['a role spelled differently', ' Full', 'FULL', 'full'],
  ])('rewrites %s in Clerk', async (_, stored, role, written) => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkHas(stored)
    expect(await getSessionUser()).toMatchObject({ role })
    expect(clerkUsers.updateUserMetadata).toHaveBeenCalledWith('user_1', {
      publicMetadata: { role: written },
    })
  })

  it('leaves a valid role alone', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkHas('admin')
    expect(await getSessionUser()).toMatchObject({ role: 'ADMIN' })
    expect(clerkUsers.updateUserMetadata).not.toHaveBeenCalled()
  })

  it('stores what Clerk lacks as empty: no email, no name, never signed in', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkUsers.getUser.mockResolvedValue({
      publicMetadata: { role: 'viewer' },
      primaryEmailAddress: null,
      fullName: null,
      username: 'jnova',
      lastSignInAt: null,
    })
    await getSessionUser()
    expect(upsertUserFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, name: 'jnova', lastSignInAt: null })
    )
    clerkUsers.getUser.mockResolvedValue({
      publicMetadata: { role: 'viewer' },
      primaryEmailAddress: null,
      fullName: null,
      username: null,
      lastSignInAt: null,
    })
    await getSessionUser()
    expect(upsertUserFromClerk).toHaveBeenLastCalledWith(expect.objectContaining({ name: null }))
  })

  it('checks Clerk again on a new sign-in, and picks up a role changed there', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(
      userRow('user_1', 'VIEWER', { lastSessionId: 'sess_0' })
    )
    clerkHas('full')
    expect(await getSessionUser()).toMatchObject({ role: 'FULL' })
    expect(upsertUserFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'FULL', sessionId: 'sess_1' })
    )
  })

  it('checks Clerk again once the stored role is older than the sync interval', async () => {
    const stale = new Date(Date.now() - SYNC_INTERVAL_MS - 1000)
    vi.mocked(findUserByClerkId).mockResolvedValue(userRow('user_1', 'ADMIN', { syncedAt: stale }))
    clerkHas('viewer')
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER' })
  })

  it('gives an archived user no access, and says why', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(userRow('user_1', 'ADMIN', { archived: true }))
    expect(await getSessionUser()).toBeNull()
    expect(await isAccountArchived()).toBe(true)
    expect(clerkClient).not.toHaveBeenCalled()
    expect(await redirectOf(requireReader())).toBe('/')
    await expect(requireAdmin()).rejects.toMatchObject({ name: 'UnauthorizedError' })
    // Archived while their row was being refreshed: still nobody.
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    vi.mocked(upsertUserFromClerk).mockResolvedValueOnce(
      userRow('user_1', 'ADMIN', { archived: true })
    )
    clerkHas('admin')
    expect(await getSessionUser()).toBeNull()
    signedIn(null)
    expect(await isAccountArchived()).toBe(false)
    signedIn('user_2', 'VIEWER')
    expect(await isAccountArchived()).toBe(false)
  })

  it('keeps the stored role when Clerk cannot be reached, and fails without one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    clerkUsers.getUser.mockRejectedValue(new Error('Clerk down'))
    vi.mocked(findUserByClerkId).mockResolvedValue(
      userRow('user_1', 'FULL', { lastSessionId: 'sess_0' })
    )
    expect(await getSessionUser()).toMatchObject({ role: 'FULL' })
    expect(warn).toHaveBeenCalled()
    // Unconfirmed for over twice the interval: read-only until Clerk answers.
    const long = new Date(Date.now() - 2 * SYNC_INTERVAL_MS - 1000)
    vi.mocked(findUserByClerkId).mockResolvedValue(userRow('user_1', 'ADMIN', { syncedAt: long }))
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER' })
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    await expect(getSessionUser()).rejects.toThrow('Clerk down')
  })
})

describe('guards', () => {
  it('let every role read; signed-out readers go to sign-in', async () => {
    for (const role of ['VIEWER', 'FULL', 'ADMIN'] as const) {
      signedIn('user_1', role)
      expect(await requireReader()).toMatchObject({ role })
    }
    vi.mocked(auth.protect).mockRejectedValue(new RedirectError('/sign-in'))
    signedIn(null)
    await expect(requireReader()).rejects.toThrow(RedirectError)
  })

  it('a reader without a row (it cannot be made) gets a 404, not a guessed role', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    vi.mocked(auth).mockResolvedValue({ userId: null, sessionId: null } as AuthResult)
    await expect(requireReader()).rejects.toThrow(NotFoundError)
  })

  it('keep edit pages and mutations to admins', async () => {
    expect(await requireAdminPage()).toMatchObject({ role: 'ADMIN' })
    expect(await requireAdmin()).toMatchObject({ id: 'usr_1' })
    for (const role of ['VIEWER', 'FULL'] as const) {
      signedIn('user_1', role)
      await expect(requireAdminPage()).rejects.toThrow(NotFoundError)
      await expect(requireAdmin()).rejects.toMatchObject({ name: 'UnauthorizedError' })
    }
    signedIn(null)
    await expect(requireAdmin()).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })
})

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
      groupSize: null,
      // Not chosen: the needs follow what the sessions import derives.
      onlineAllowed: null,
      capabilities: [],
    })
    // The browser refreshes its own read cache; no server route is refreshed.
    expect(revalidatePath).not.toHaveBeenCalled()
    // "Yes" and "No" override it; anything else leaves it to the sessions.
    for (const [posted, value] of [
      ['yes', true],
      ['no', false],
      ['derived', null],
    ] as const) {
      await redirectOf(saveCourse('BOZP-Z', idle, form({ name: 'BOZP', onlineAllowed: posted })))
      expect(updateCourse).toHaveBeenLastCalledWith(
        'BOZP-Z',
        expect.objectContaining({ onlineAllowed: value })
      )
    }
  })

  it('say how many planned sessions a course change would strand', async () => {
    vi.mocked(updateCourse).mockResolvedValueOnce({
      ok: false,
      field: 'onlineAllowed',
      reason: 'sessions_unfit',
      count: 2,
    })
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP', onlineAllowed: 'no' }))).toEqual({
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
    date: '2026-11-04',
    startTime: '08:00',
    endTime: '11:00',
    roomId: 'room_aula_a',
    capacity: '30',
    pricePerPerson: '450,50 Kč',
    status: 'PLANNED',
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
        roomId: 'room_aula_a',
        unnamedBookings: 0,
        pricePerPerson: 450.5,
      })
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
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'OVER_CAPACITY' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { capacity: 'over_capacity' },
    })
    vi.mocked(updateSession).mockResolvedValueOnce({ ok: false, problem: 'COURSE_ARCHIVED' })
    expect(await saveSession('T016', idle, form(sessionForm))).toMatchObject({
      fieldErrors: { courseId: 'course_archived' },
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

describe('department and position actions', () => {
  it('save a department with its head and show it, saying why not', async () => {
    vi.mocked(saveDepartment).mockResolvedValueOnce({ ok: true, id: 'dep_new' })
    expect(await redirectOf(saveDepartmentAction(null, idle, form({ name: 'Nový' })))).toBe(
      '/departments/dep_new'
    )
    expect(saveDepartment).toHaveBeenLastCalledWith(null, { name: 'Nový', headId: null })
    vi.mocked(saveDepartment).mockResolvedValueOnce({ ok: true, id: 'dep_lab' })
    await redirectOf(
      saveDepartmentAction('dep_lab', idle, form({ name: 'Laboratoře', headId: 'emp_1' }))
    )
    expect(saveDepartment).toHaveBeenLastCalledWith('dep_lab', {
      name: 'Laboratoře',
      headId: 'emp_1',
    })
    for (const [problem, key] of [
      [{ field: 'name', reason: 'taken' }, 'taken'],
      [{ field: 'headId', reason: 'not_a_member' }, 'not_a_member'],
    ] as const) {
      vi.mocked(saveDepartment).mockResolvedValueOnce({ ok: false, ...problem })
      expect(await saveDepartmentAction('dep_lab', idle, form({ name: 'X' }))).toEqual({
        status: 'error',
        fieldErrors: { [problem.field]: key },
      })
    }
    expect(await saveDepartmentAction('dep_lab', idle, form({ name: '' }))).toMatchObject({
      fieldErrors: { name: 'required' },
    })
    vi.mocked(saveDepartment).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveDepartmentAction('gone', idle, form({ name: 'X' }))).toMatchObject({
      formError: 'not_found',
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(saveDepartment).mockRejectedValueOnce(new Error('down'))
    expect(await saveDepartmentAction(null, idle, form({ name: 'X' }))).toMatchObject({
      formError: 'generic',
    })
  })

  it('save a position with its departments, saying how many people hold it elsewhere', async () => {
    vi.mocked(savePosition).mockResolvedValueOnce({ ok: true, id: 'pos_1' })
    const data = form({ name: 'Referent' })
    data.append('departmentIds', 'dep_lab')
    data.append('departmentIds', 'dep_lib')
    expect(await redirectOf(savePositionAction('pos_1', idle, data))).toBe('/positions/pos_1')
    expect(savePosition).toHaveBeenLastCalledWith('pos_1', {
      name: 'Referent',
      departmentIds: ['dep_lab', 'dep_lib'],
    })
    vi.mocked(savePosition).mockResolvedValueOnce({
      ok: false,
      field: 'departmentIds',
      reason: 'in_use',
      count: 3,
    })
    expect(await savePositionAction('pos_1', idle, form({ name: 'Referent' }))).toEqual({
      status: 'error',
      fieldErrors: { departmentIds: 'in_use' },
      values: { departmentIds: { count: 3 } },
    })
    vi.mocked(savePosition).mockResolvedValueOnce({
      ok: false,
      field: 'departmentIds',
      reason: 'not_found',
    })
    expect(await savePositionAction('pos_1', idle, form({ name: 'Referent' }))).toEqual({
      status: 'error',
      fieldErrors: { departmentIds: 'unavailable' },
    })
  })
})

describe('role changes', () => {
  it('write the role here first, then to Clerk, and show the user', async () => {
    vi.mocked(setUserRole).mockResolvedValue({ ok: true, clerkId: 'user_2', previous: 'VIEWER' })
    expect(await redirectOf(saveUserRole('usr_2', idle, form({ role: 'FULL' })))).toBe(
      '/users/usr_2'
    )
    expect(setUserRole).toHaveBeenCalledWith('usr_2', 'FULL', 'usr_1')
    expect(clerkUsers.updateUserMetadata).toHaveBeenCalledWith('user_2', {
      publicMetadata: { role: 'full' },
    })
    expect(revertUserRole).not.toHaveBeenCalled()
  })

  it('refuse an unknown role, one’s own, the last admin’s, and a user who is gone', async () => {
    expect(await saveUserRole('usr_2', idle, form({ role: 'OWNER' }))).toMatchObject({
      fieldErrors: { role: 'required' },
    })
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, reason: 'SELF' })
    expect(await saveUserRole('usr_1', idle, form({ role: 'FULL' }))).toMatchObject({
      fieldErrors: { role: 'own_role' },
    })
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, reason: 'LAST_ADMIN' })
    expect(await saveUserRole('usr_2', idle, form({ role: 'FULL' }))).toMatchObject({
      fieldErrors: { role: 'last_admin' },
    })
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' })
    expect(await saveUserRole('gone', idle, form({ role: 'FULL' }))).toMatchObject({
      formError: 'not_found',
    })
    // Nothing refused here ever reaches Clerk.
    expect(clerkUsers.updateUserMetadata).not.toHaveBeenCalled()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(setUserRole).mockRejectedValueOnce(new Error('deadlock'))
    expect(await saveUserRole('usr_2', idle, form({ role: 'FULL' }))).toMatchObject({
      formError: 'generic',
    })
  })

  it('puts the role back when Clerk refuses it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(setUserRole).mockResolvedValue({ ok: true, clerkId: 'user_2', previous: 'ADMIN' })
    clerkUsers.updateUserMetadata.mockRejectedValueOnce(new Error('Clerk down'))
    expect(await saveUserRole('usr_2', idle, form({ role: 'FULL' }))).toMatchObject({
      formError: 'generic',
    })
    expect(revertUserRole).toHaveBeenCalledWith('usr_2', { from: 'ADMIN', to: 'FULL' })
  })
})

describe('booking actions', () => {
  const pair = { sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'ADVISOR' }

  it('save bookings as the signed-in admin and report each refusal', async () => {
    vi.mocked(applyAssignments).mockResolvedValue([
      { request: { ...pair, source: 'ADVISOR' }, ok: true },
      {
        request: { ...pair, employeeExternalId: 'E0002', source: 'ADVISOR' },
        ok: false,
        reason: 'SESSION_FULL',
      },
    ])
    expect(await applyAssignmentsAction([pair, { ...pair, employeeExternalId: 'E0002' }])).toEqual({
      ok: true,
      applied: 1,
      failed: [{ sessionExternalId: 'T018', employeeExternalId: 'E0002', reason: 'SESSION_FULL' }],
    })
    // The users-table id, not the Clerk id.
    expect(applyAssignments).toHaveBeenCalledWith(expect.any(Array), 'usr_1')
    // Nonsense is answered, never thrown, and never reaches the database.
    expect(await applyAssignmentsAction([])).toEqual({ ok: false, problem: 'invalid' })
    expect(await applyAssignmentsAction([{ ...pair, score: 1, source: 'GUESS' }])).toEqual({
      ok: false,
      problem: 'invalid',
    })
    expect(applyAssignments).toHaveBeenCalledTimes(1)
    // A write that fails says so.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(applyAssignments).mockRejectedValueOnce(new Error('deadlock'))
    expect(await applyAssignmentsAction([pair])).toEqual({ ok: false, problem: 'failed' })
    signedIn('user_1', 'FULL')
    expect(await applyAssignmentsAction([pair])).toEqual({ ok: false, problem: 'unauthorized' })
  })

  it('cancel a booking, and resolve overbooking the way the admin chose', async () => {
    vi.mocked(removeAssignment).mockResolvedValueOnce(true)
    const booking = { sessionExternalId: 'T018', employeeExternalId: 'E0153' }
    expect(await removeAssignmentAction(booking)).toEqual({ ok: true })
    vi.mocked(removeAssignment).mockResolvedValueOnce(false)
    expect(await removeAssignmentAction(booking)).toEqual({ ok: false, reason: 'gone' })
    expect(await removeAssignmentAction({ sessionExternalId: 'T018' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    // Seats moved to the sessions picked, all at once, or why not and where.
    vi.mocked(moveSeatsMany).mockResolvedValueOnce({ ok: false, reason: 'TARGET_FULL', to: 'T018' })
    const moves = [{ to: 'T018', count: 1 }]
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'move', moves } })
    ).toEqual({ ok: false, reason: 'TARGET_FULL', to: 'T018' })
    expect(moveSeatsMany).toHaveBeenCalledWith('T016', moves)
    vi.mocked(moveSeatsMany).mockResolvedValueOnce({ ok: true, moved: 1 })
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'move', moves } })
    ).toEqual({ ok: true })
    // Or the capacity raised, when the room has the seats.
    vi.mocked(raiseCapacity).mockResolvedValueOnce({ ok: false, problem: 'ROOM_TOO_SMALL' })
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'raise', capacity: 31 } })
    ).toEqual({ ok: false, reason: 'ROOM_TOO_SMALL' })
    vi.mocked(raiseCapacity).mockResolvedValueOnce({ ok: true })
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'raise', capacity: 31 } })
    ).toEqual({ ok: true })
    // Nonsense never reaches the database.
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'move', moves: [] } })
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('book one person by hand, as the admin, and say why the server refused', async () => {
    vi.mocked(applyAssignments).mockResolvedValueOnce([
      { request: { ...pair, source: 'MANUAL' }, ok: true },
    ])
    expect(
      await addBookingAction('T018', { status: 'idle' }, form({ employeeExternalId: 'E0153' }))
    ).toEqual({ status: 'done' })
    expect(applyAssignments).toHaveBeenLastCalledWith(
      [{ sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'MANUAL' }],
      'usr_1'
    )
    vi.mocked(applyAssignments).mockResolvedValueOnce([
      { request: { ...pair, source: 'MANUAL' }, ok: false, reason: 'CONFLICT' },
    ])
    expect(
      await addBookingAction('T018', { status: 'idle' }, form({ employeeExternalId: 'E0153' }))
    ).toEqual({ status: 'refused', reason: 'CONFLICT' })
    // Nothing chosen: nothing is sent.
    expect(await addBookingAction('T018', { status: 'idle' }, form({}))).toEqual({
      status: 'refused',
      reason: 'invalid',
    })
    expect(applyAssignments).toHaveBeenCalledTimes(2)
    signedIn('user_1', 'VIEWER')
    expect(await addBookingAction('T018', { status: 'idle' }, form({}))).toEqual({
      status: 'refused',
      reason: 'unauthorized',
    })
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
    vi.mocked(commitChunk).mockResolvedValue({ created: 1, updated: 0, skipped: 2 })
    expect(await commitImportChunk('courses', [course])).toEqual({
      ok: true,
      created: 1,
      updated: 0,
      skipped: 2,
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
    // Valid, but in the way of what the app planned.
    vi.mocked(commitChunk).mockRejectedValueOnce(
      new CommitRefusedError(1, 'ROOM_BUSY', 'T951 → S001')
    )
    expect(await commitImportChunk('sessions', [course])).toEqual({
      ok: false,
      error: 'room_busy',
      detail: '#1: T951 → S001',
    })
    vi.mocked(commitChunk).mockRejectedValueOnce(new CommitRefusedError(0, 'ROOM_UNFIT', 'Aula A'))
    expect(await commitImportChunk('rooms', [course])).toMatchObject({ error: 'room_unfit' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(commitChunk).mockRejectedValueOnce(new Error('deadlock'))
    expect(await commitImportChunk('sessions', [course])).toEqual({ ok: false, error: 'failed' })
    expect(log).toHaveBeenCalled()
  })
})

describe('proxy', () => {
  it('sends visitors to sign-in everywhere but the home page and Clerk’s pages', async () => {
    const { default: handler, config, isPublicPath } = await import('@/proxy')
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image).*)'])
    // To the app's own sign-in page, not Clerk's hosted one.
    expect(clerkMiddleware).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        signInUrl: '/sign-in',
        signUpUrl: '/sign-up',
        // A nonce-based policy, and no framing.
        contentSecurityPolicy: expect.objectContaining({
          strict: true,
          directives: expect.objectContaining({ 'frame-ancestors': ['none'] }) as object,
        }) as object,
      })
    )
    const protect = vi.fn()
    const run = (pathname: string) =>
      (handler as unknown as (auth: unknown, request: unknown) => Promise<void>)(
        { protect },
        { nextUrl: { pathname } }
      )
    for (const path of [
      '/',
      '/sign-in',
      '/sign-in/factor-one',
      '/sign-up',
      '/robots.txt',
      '/icon.svg',
      '/missing.png',
    ]) {
      expect(isPublicPath(path), path).toBe(true)
      await run(path)
    }
    expect(protect).not.toHaveBeenCalled()
    for (const path of [
      '/employees',
      '/users',
      '/sign-inx',
      '/signup',
      '/employees/E0001',
      // Reads are never public, whatever their name ends in; nor is a record with a dot.
      '/api/read/employees.json',
      '/employees/E0001.pdf',
    ]) {
      expect(isPublicPath(path), path).toBe(false)
      await run(path)
    }
    expect(protect).toHaveBeenCalledTimes(7)
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
    vi.mocked(createRoom).mockResolvedValue({ ok: true, id: 'room_new' })
    expect(await redirectOf(saveRoom(null, idle, withEquipment()))).toBe('/rooms/room_new')
    expect(createRoom).toHaveBeenCalledWith({
      name: 'Laboratoř 4',
      kind: 'LAB',
      capacity: 16,
      capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
      note: null,
    })
    vi.mocked(updateRoom).mockResolvedValue({ ok: true, id: 'room_lab' })
    expect(await redirectOf(saveRoom('room_lab', idle, form(roomForm)))).toBe('/rooms/room_lab')
    expect(updateRoom).toHaveBeenCalledWith(
      'room_lab',
      expect.objectContaining({ capabilities: [] })
    )
    // Smaller than sessions planned in it need: refused, with how many.
    vi.mocked(updateRoom).mockResolvedValueOnce({
      ok: false,
      field: 'capacity',
      reason: 'sessions_unfit',
      count: 2,
    })
    expect(await saveRoom('room_lab', idle, form(roomForm))).toEqual({
      status: 'error',
      fieldErrors: { capacity: 'sessions_unfit' },
      values: { capacity: { count: 2 } },
    })
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
})

describe('provider actions', () => {
  const providerForm = {
    name: 'Vzorový školicí ústav',
    companyId: '002 16 224',
    email: '',
    phone: '+420 549 49 1111',
    website: 'www.vzor.example',
    note: '',
  }

  it('save a provider with its details read and normalised, then show it', async () => {
    vi.mocked(createProvider).mockResolvedValueOnce({ ok: true, id: 'prov_new' })
    expect(await redirectOf(saveProvider(null, idle, form(providerForm)))).toBe(
      '/providers/prov_new'
    )
    expect(createProvider).toHaveBeenCalledWith({
      name: 'Vzorový školicí ústav',
      companyId: '00216224',
      email: null,
      phone: '+420 549 49 1111',
      website: 'https://www.vzor.example',
      note: null,
    })
    vi.mocked(updateProvider).mockResolvedValueOnce({ ok: true, id: 'prov_1' })
    expect(await redirectOf(saveProvider('prov_1', idle, form(providerForm)))).toBe(
      '/providers/prov_1'
    )
  })

  it('name what is wrong: the IČO, the email, a taken name or IČO, a provider that is gone', async () => {
    expect(
      await saveProvider(null, idle, form({ ...providerForm, companyId: '00216225', email: 'x' }))
    ).toEqual({
      status: 'error',
      fieldErrors: { companyId: 'company_id', email: 'invalid_email' },
    })
    expect(createProvider).not.toHaveBeenCalled()
    vi.mocked(createProvider).mockResolvedValueOnce({ ok: false, taken: 'companyId' })
    expect(await saveProvider(null, idle, form(providerForm))).toEqual({
      status: 'error',
      fieldErrors: { companyId: 'taken' },
    })
    vi.mocked(updateProvider).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveProvider('gone', idle, form(providerForm))).toMatchObject({
      formError: 'not_found',
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(updateProvider).mockRejectedValueOnce(new Error('down'))
    expect(await saveProvider('prov_1', idle, form(providerForm))).toMatchObject({
      formError: 'generic',
    })
  })

  it('save providers for admins only', async () => {
    signedIn(null)
    expect(await saveProvider(null, idle, form(providerForm))).toMatchObject({
      formError: 'unauthorized',
    })
  })
})

describe('session creation', () => {
  const create = {
    courseId: 'course_poz',
    date: '2026-10-19',
    startTime: '10:00',
    endTime: '12:00',
    roomId: 'room_aula_a',
    capacity: 40,
    pricePerPerson: null,
    status: 'PLANNED' as const,
  }

  it('checks, then creates a planned session with its people, or says why not', async () => {
    const created = {
      ok: true as const,
      externalId: 'S001',
      courseCode: 'POZ-OCH',
      booked: 2,
      dryRun: true,
    }
    vi.mocked(createSessionWithBookings).mockResolvedValue(created)
    const people = ['E0153', 'E0002']
    expect(await createPlannedSessionAction({ session: create, people, dryRun: true })).toEqual(
      created
    )
    expect(createSessionWithBookings).toHaveBeenCalledWith(create, people, 'usr_1', {
      dryRun: true,
    })
    expect(
      await createPlannedSessionAction({
        session: { ...create, endTime: '09:00' },
        people,
        dryRun: false,
      })
    ).toEqual({ ok: false, problem: 'invalid', refusals: [] })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(createSessionWithBookings).mockRejectedValueOnce(new Error('down'))
    expect(await createPlannedSessionAction({ session: create, people, dryRun: false })).toEqual({
      ok: false,
      problem: 'failed',
      refusals: [],
    })
    // Signed out meanwhile: a reason to show, not an error page.
    signedIn(null)
    expect(await createPlannedSessionAction({ session: create, people, dryRun: false })).toEqual({
      ok: false,
      problem: 'unauthorized',
      refusals: [],
    })
  })

  it('creates a session from the form and opens it', async () => {
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      externalId: 'S002',
      courseCode: 'POZ-OCH',
    })
    const fields = {
      courseId: 'course_poz',
      date: '2026-11-02',
      startTime: '10:00',
      endTime: '12:00',
      roomId: 'room_aula_a',
      capacity: '40',
      pricePerPerson: '380,- Kč',
      status: 'PLANNED',
    }
    expect(await redirectOf(saveNewSession(idle, form(fields)))).toBe('/sessions/S002')
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ courseId: 'course_poz', capacity: 40, pricePerPerson: 380 })
    )
    expect(await saveNewSession(idle, form({ ...fields, roomId: '' }))).toMatchObject({
      fieldErrors: { roomId: 'required' },
    })
    expect(await saveNewSession(idle, form({ ...fields, courseId: '' }))).toMatchObject({
      fieldErrors: { courseId: 'required' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(createSession).mockRejectedValueOnce(new Error('down'))
    expect(await saveNewSession(idle, form(fields))).toMatchObject({
      formError: 'generic',
    })
    vi.mocked(createSession).mockResolvedValueOnce({
      ok: false,
      problem: 'ROOM_MISSING_CAPABILITIES',
    })
    expect(await saveNewSession(idle, form(fields))).toMatchObject({
      fieldErrors: { roomId: 'room_missing_capabilities' },
    })
  })

  it('tells the form whether the room is taken then, and only admins', async () => {
    const slot = { roomId: 'room_aula_a', date: '2026-11-02', startTime: '10:00', endTime: '12:00' }
    vi.mocked(checkSessionSlot).mockResolvedValue('ROOM_BUSY')
    expect(await checkSessionSlotAction(slot, 'T016')).toBe('ROOM_BUSY')
    expect(checkSessionSlot).toHaveBeenLastCalledWith(slot, 'T016')
    // Nonsense in: no question asked.
    expect(await checkSessionSlotAction({ ...slot, date: 'zítra' }, null)).toBeNull()
    expect(await checkSessionSlotAction(slot, 5 as unknown as string)).toBeNull()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(checkSessionSlot).mockRejectedValueOnce(new Error('down'))
    expect(await checkSessionSlotAction(slot, null)).toBeNull()
    expect(checkSessionSlot).toHaveBeenCalledTimes(2)
    for (const user of [null, 'user_2'] as const) {
      signedIn(user, 'FULL')
      expect(await checkSessionSlotAction(slot, null)).toBeNull()
    }
    expect(checkSessionSlot).toHaveBeenCalledTimes(2)
  })
})

describe('archive actions', () => {
  it('archive for an admin, as them, then show the list', async () => {
    vi.mocked(archiveRecord).mockResolvedValue({ ok: true, removesBookings: 2 })
    expect(await redirectOf(archiveAction('room', 'room_1', '/rooms', idle))).toBe('/rooms')
    expect(archiveRecord).toHaveBeenCalledWith('room', 'room_1', 'usr_1')
    // From a list row, the page stays.
    expect(await archiveAction('room', 'room_1', null, idle)).toEqual({ status: 'done' })
  })

  it('say why a record cannot be archived, and how much is in the way', async () => {
    vi.mocked(archiveRecord).mockResolvedValueOnce({ ok: false, reason: 'IN_USE', count: 7 })
    expect(await archiveAction('room', 'room_1', '/rooms', idle)).toEqual({
      status: 'refused',
      reason: 'in_use',
      count: 7,
    })
    vi.mocked(archiveRecord).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND', count: 0 })
    expect(await archiveAction('room', 'gone', '/rooms', idle)).toMatchObject({
      reason: 'not_found',
    })
    vi.mocked(archiveRecord).mockResolvedValueOnce({ ok: false, reason: 'LAST_ADMIN', count: 0 })
    expect(await archiveAction('user', 'usr_2', null, idle)).toMatchObject({ reason: 'last_admin' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(archiveRecord).mockRejectedValueOnce(new Error('down'))
    expect(await archiveAction('room', 'room_1', null, idle)).toMatchObject({ reason: 'generic' })
  })

  it('take no kind, id or destination the app does not know', async () => {
    for (const [kind, id, then] of [
      ['pet', 'x', null],
      ['room', '', null],
      ['room', 'room_1', 'https://evil.example'],
      ['room', 'room_1', '//evil.example'],
    ] as const) {
      expect(await archiveAction(kind as never, id, then, idle)).toMatchObject({
        reason: 'generic',
      })
      expect(await unarchiveAction(kind as never, id, then, idle)).toMatchObject({
        reason: 'generic',
      })
    }
    expect(await previewArchive('pet' as never, 'x')).toBeNull()
    expect(await previewArchive('room', '')).toBeNull()
    expect(archiveRecord).not.toHaveBeenCalled()
  })

  it('bring a record back, or say what holds its name or what it belongs to', async () => {
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: true })
    expect(await redirectOf(unarchiveAction('course', 'c1', '/courses', idle))).toBe('/courses')
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({
      ok: false,
      reason: 'TAKEN',
      fields: ['code'],
    })
    expect(await unarchiveAction('course', 'c1', null, idle)).toEqual({
      status: 'refused',
      reason: 'taken',
      fields: ['code'],
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: false, reason: 'PARENT_ARCHIVED' })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'parent_archived',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'not_found',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({
      ok: false,
      reason: 'SESSION',
      problem: 'ROOM_BUSY',
    })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'room_busy',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({
      ok: false,
      reason: 'SESSION',
      problem: 'ROOM_TOO_SMALL',
    })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'room_unfit',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: true })
    expect(await unarchiveAction('session', 's1', null, idle)).toEqual({ status: 'done' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(unarchiveRecord).mockRejectedValueOnce(new Error('down'))
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({ reason: 'generic' })
  })

  it('preview for admins only; everyone else is refused', async () => {
    vi.mocked(archiveImpact).mockResolvedValue({ ok: true, removesBookings: 1 })
    expect(await previewArchive('employee', 'e1')).toEqual({ ok: true, removesBookings: 1 })
    for (const role of ['VIEWER', 'FULL'] as const) {
      signedIn('user_1', role)
      expect(await previewArchive('employee', 'e1')).toBeNull()
      expect(await archiveAction('employee', 'e1', null, idle)).toEqual({
        status: 'refused',
        reason: 'unauthorized',
      })
      expect(await unarchiveAction('employee', 'e1', null, idle)).toEqual({
        status: 'refused',
        reason: 'unauthorized',
      })
    }
    expect(archiveImpact).toHaveBeenCalledTimes(1)
  })
})

describe('the write guard', () => {
  it('answers every failure with the write’s own outcome, never a throw', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // The rate limit itself failing (the database is down) is a failure, not a refusal.
    vi.mocked(spendRequest).mockRejectedValueOnce(new Error('db down'))
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toMatchObject({
      formError: 'generic',
    })
    // Two rooms named alike at once: the index refused the second.
    vi.mocked(createRoom).mockRejectedValueOnce({ code: 'P2002' })
    expect(
      await saveRoom(
        null,
        idle,
        form({ name: 'Aula A', kind: 'CLASSROOM', capacity: '20', note: '' })
      )
    ).toEqual({ status: 'error', fieldErrors: { name: 'taken' } })
    vi.mocked(archiveImpact).mockRejectedValueOnce(new Error('timeout'))
    expect(await previewArchive('employee', 'e1')).toBeNull()
    vi.mocked(findArchivedKeys).mockRejectedValueOnce(new Error('timeout'))
    expect(await findArchived(NO_ARCHIVED)).toEqual(NO_ARCHIVED)
    vi.mocked(removeAssignment).mockRejectedValueOnce(new Error('timeout'))
    expect(
      await removeAssignmentAction({ sessionExternalId: 'T018', employeeExternalId: 'E0153' })
    ).toEqual({ ok: false, reason: 'failed' })
    vi.mocked(moveSeatsMany).mockRejectedValueOnce(new Error('timeout'))
    expect(
      await resolveOverbookingAction({
        from: 'T016',
        resolution: { kind: 'move', moves: [{ to: 'T018', count: 1 }] },
      })
    ).toEqual({ ok: false, reason: 'failed' })
    vi.mocked(applyAssignments).mockResolvedValueOnce([])
    expect(
      await addBookingAction('T018', { status: 'idle' }, form({ employeeExternalId: 'E0153' }))
    ).toEqual({ status: 'refused', reason: 'failed' })
    expect(log).toHaveBeenCalled()
  })
})

describe('archived keys for the import review', () => {
  const candidates = { ...NO_ARCHIVED, employees: ['E0066'] }

  it('asks the database about the batch keys, for admins only', async () => {
    vi.mocked(findArchivedKeys).mockResolvedValue({ ...NO_ARCHIVED, employees: ['E0066'] })
    expect(await findArchived(candidates)).toEqual({ ...NO_ARCHIVED, employees: ['E0066'] })
    expect(findArchivedKeys).toHaveBeenCalledWith('db', candidates)
    expect(await findArchived({ ...candidates, rooms: 'x' } as never)).toEqual(NO_ARCHIVED)
    signedIn('user_1', 'FULL')
    expect(await findArchived(candidates)).toEqual(NO_ARCHIVED)
    expect(findArchivedKeys).toHaveBeenCalledTimes(1)
  })
})
