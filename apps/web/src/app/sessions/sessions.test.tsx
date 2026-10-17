// @vitest-environment jsdom
import {
  getAdvisorInput,
  getSession,
  listCourseOptions,
  listEmployeeOptions,
  listRoomOptions,
  listSessions,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { removeAssignmentAction } from '@/server/actions/assignments'
import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { advisorInput, AULA_A, ONLINE, session } from '@/test/fixtures'
import { NotFoundError, router } from '@/test/next'
import { params, renderServer } from '@/test/render'

import AdvisorPage, { generateMetadata as advisorMetadata } from '../advisor/page'
import EditSessionPage from './[externalId]/edit/page'
import SessionPage, { generateMetadata as sessionMetadata } from './[externalId]/page'
import NewSessionsPage, { generateMetadata as newSessionMetadata } from './new/page'
import SessionsPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  listRoomOptions: vi.fn(),
  listCourseOptions: vi.fn(),
  listEmployeeOptions: vi.fn(() => Promise.resolve([])),
  getAdvisorInput: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({ saveSession: vi.fn() }))
vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))
vi.mock('@/server/actions/sessions', () => ({
  saveNewSession: vi.fn(),
  checkSessionSlotAction: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('@/server/actions/assignments', () => ({
  addBookingAction: vi.fn(),
  applyAssignmentsAction: vi.fn(),
  moveSeatsAction: vi.fn(),
  removeAssignmentAction: vi.fn(() => Promise.resolve({ ok: true })),
}))

const online = session({
  externalId: 'T020',
  courseCode: 'GDPR',
  courseName: 'Ochrana osobních údajů',
  room: ONLINE,
  capacity: 100,
  unnamedBookings: 12,
  bookings: [],
  bookedCount: 12,
  pricePerPerson: null,
})

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listSessions).mockResolvedValue([
    session(),
    online,
    session({
      externalId: 'T030',
      bookedCount: 31,
      unnamedBookings: 31,
      bookings: [],
      capacity: 30,
    }),
  ])
  vi.mocked(getSession).mockResolvedValue(session())
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
  vi.mocked(listRoomOptions).mockResolvedValue([
    { ...AULA_A, capacity: 40, capabilities: [] },
    { ...ONLINE, capacity: null, capabilities: [] },
  ])
  vi.mocked(listCourseOptions).mockResolvedValue([
    {
      id: 'course_bozp',
      code: 'BOZP-Z',
      name: 'BOZP – základní školení',
      validityMonths: 24,
      needs: { sessionMinutes: 180, groupSize: 30, onlineAllowed: true, capabilities: [] },
    },
  ])
})

describe('session list', () => {
  const search = (query: Record<string, string>) => ({ searchParams: params(query) })

  it('lists upcoming sessions, linking the date to the session and the place to its room', async () => {
    expect(await listMetadata(search({}))).toEqual({ title: 'Sessions' })
    await renderServer(SessionsPage(search({})))
    expect(listSessions).toHaveBeenCalledWith({ window: 'upcoming', room: undefined })
    expect(screen.getByRole('link', { name: 'Upcoming' }).getAttribute('aria-current')).toBe('page')
    const row = screen.getByRole('row', { name: /T020/ })
    expect(within(row).getByRole('link', { name: 'Online' }).getAttribute('href')).toBe(
      '/rooms/room_online'
    )
    expect(within(row).getByText('Online', { selector: '.sr-only' })).toBeTruthy()
    expect(
      within(row)
        .getByRole('link', { name: /Nov 4, 2026/ })
        .getAttribute('href')
    ).toBe('/sessions/T020')
    expect(within(row).getByText('—')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /T030/ })).getByText('Overbooked')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /T016/ })).getByText('Full')).toBeTruthy()
  })

  it('filters by room and keeps it across the upcoming/past tabs', async () => {
    expect(await listMetadata(search({ room: 'room_aula_a' }))).toEqual({
      title: 'Sessions at Aula A',
    })
    await renderServer(SessionsPage(search({ when: 'past', room: 'room_aula_a' })))
    expect(listSessions).toHaveBeenCalledWith({ window: 'past', room: 'room_aula_a' })
    expect(screen.getByRole('heading', { level: 1, name: 'Sessions at Aula A' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Upcoming' }).getAttribute('href')).toBe(
      '/sessions?room=room_aula_a'
    )
    expect(screen.getByRole('link', { name: 'Past' }).getAttribute('aria-current')).toBe('page')
    // The room filter shows the room; choosing all rooms keeps the past tab.
    const filter = screen.getByRole('combobox', { name: 'Room' })
    expect(filter.textContent).toContain('Aula A')
    await userEvent.setup().click(filter)
    await userEvent.setup().click(screen.getByRole('option', { name: 'All locations' }))
    expect(router.push).toHaveBeenCalledWith('/sessions?when=past')
  })

  it('opens a session row to the session and the people booked on it', async () => {
    const user = userEvent.setup()
    await renderServer(SessionsPage(search({})))
    // Every session opens, with or without named bookings.
    await user.click(screen.getByRole('button', { name: 'Who is booked on T020' }))
    expect(
      screen.getByText('Nobody is booked by name yet; the advisor can suggest people.')
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Who is booked on T016' }))
    expect(screen.getAllByText(/29 without a name/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The room suits it.').length).toBeGreaterThan(0)
    // The people, with where they work and how they were booked.
    const people = screen.getByRole('table', { name: 'Booked by name' })
    expect(within(people).getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(within(people).getByText('Laboratoře')).toBeTruthy()
    expect(within(people).getByText('Advisor')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('shows nothing for a room that does not exist', async () => {
    expect(await listMetadata(search({ room: 'gone' }))).toEqual({ title: 'Sessions' })
    await renderServer(SessionsPage(search({ room: 'gone' })))
    expect(screen.getByRole('heading', { level: 1, name: 'Sessions' })).toBeTruthy()
    expect(screen.getByText('No sessions to show.')).toBeTruthy()
  })

  it('says when there is nothing to show', async () => {
    vi.mocked(listSessions).mockResolvedValue([])
    await renderServer(SessionsPage(search({})))
    expect(screen.getByText('No sessions to show.')).toBeTruthy()
  })
})

describe('session detail', () => {
  const props = { params: params({ externalId: 'T016' }) }

  it('is titled by course and date once its data is there; an unknown ID is not found', async () => {
    expect(await sessionMetadata(props)).toEqual({ title: 'BOZP – základní školení · Nov 4, 2026' })
    await renderServer(SessionPage(props))
    expect(document.title).toBe('BOZP – základní školení · Nov 4, 2026 · Training register')
    vi.mocked(getSession).mockResolvedValueOnce(null)
    await expect(
      renderServer(SessionPage({ params: params({ externalId: 'T999' }) }))
    ).rejects.toThrow(NotFoundError)
  })

  it('shows the facts, seats and named bookings, read-only for viewers', async () => {
    await renderServer(SessionPage(props))
    expect(screen.getByRole('link', { name: 'Back to Sessions' }).getAttribute('href')).toBe(
      '/sessions'
    )
    expect(screen.getByRole('link', { name: 'BOZP – základní školení' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z'
    )
    expect(screen.getByRole('link', { name: 'Aula A' }).getAttribute('href')).toBe(
      '/rooms/room_aula_a'
    )
    expect(screen.getByRole('meter', { name: 'Seats' }).getAttribute('aria-valuenow')).toBe('30')
    expect(screen.getByText('Full')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel the booking/ })).toBeNull()
  })

  it('lets admins edit the session, book people and cancel a booking', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    vi.mocked(listEmployeeOptions).mockResolvedValue([
      { id: 'emp_E0001', externalId: 'E0001', name: 'Urbanová Tereza', departmentId: null },
      { id: 'emp_E0153', externalId: 'E0153', name: 'Černá Marie', departmentId: 'dep_lab' },
    ])
    await renderServer(SessionPage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/sessions/T016/edit'
    )
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    // People not yet booked can be added by hand; the booked one is not offered.
    await user.click(screen.getByRole('combobox', { name: 'Person to book' }))
    expect(screen.getByRole('option', { name: 'Urbanová Tereza' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Černá Marie' })).toBeNull()
    await user.keyboard('{Escape}')
    await expectNoAxeViolations()
    await user.click(screen.getByRole('button', { name: 'Cancel the booking of Černá Marie' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Remove Černá Marie from this session?',
    })
    // The buttons say what each does: keep it, or cancel it.
    expect(within(confirm).getByRole('button', { name: 'Keep booking' })).toBeTruthy()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel booking' }))
    expect(removeAssignmentAction).toHaveBeenCalledWith({
      sessionExternalId: 'T016',
      employeeExternalId: 'E0153',
    })
    expect(await screen.findByText('Booking cancelled')).toBeTruthy()
  })

  it('says when nobody is booked by name', async () => {
    vi.mocked(getSession).mockResolvedValue(online)
    await renderServer(SessionPage(props))
    expect(
      screen.getByText('Nobody is booked by name yet; the advisor can suggest people.')
    ).toBeTruthy()
  })
})

describe('session edit', () => {
  const props = { params: params({ externalId: 'T016' }) }
  beforeEach(() => {
    signInAs('ADMIN')
  })

  it('edits a session for admins, with Save and Cancel on the heading row', async () => {
    await renderServer(EditSessionPage(props))
    expect(requireAdminPage).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Edit session T016' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Room/ }).textContent).toContain('Aula A')
    // Its course can change too.
    expect(screen.getByRole('combobox', { name: /Course/ }).textContent).toContain('BOZP-Z')
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/sessions/T016')
    await expectNoAxeViolations()
  })

  it('is a 404 for an unknown session', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    await expect(renderServer(EditSessionPage(props))).rejects.toThrow(NotFoundError)
  })

  it('keeps an archived course on a past session as its own option', async () => {
    vi.mocked(getSession).mockResolvedValue(
      session({
        courseId: 'course_old',
        courseCode: 'OLD-1',
        courseName: 'Starý',
        courseArchived: true,
      })
    )
    // The database adds the session's own course, archived as it is, with what it needs.
    vi.mocked(listCourseOptions).mockImplementationOnce(options =>
      Promise.resolve(
        options?.keep === 'course_old'
          ? [
              {
                id: 'course_old',
                code: 'OLD-1',
                name: 'Starý',
                validityMonths: null,
                needs: {
                  sessionMinutes: 60,
                  groupSize: 10,
                  onlineAllowed: false,
                  capabilities: [],
                },
              },
            ]
          : []
      )
    )
    await renderServer(EditSessionPage(props))
    expect(listCourseOptions).toHaveBeenCalledWith({ keep: 'course_old' })
    expect(screen.getByRole('combobox', { name: /Course/ }).textContent).toContain('OLD-1')
  })

  it('adds a session of a course chosen in the form, from the sessions list', async () => {
    signInAs('ADMIN')
    expect(await newSessionMetadata()).toEqual({ title: 'New session' })
    await renderServer(NewSessionsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'New session' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Course/ })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /^Start/ })).toHaveProperty('value', '09:00')
    await expectNoAxeViolations()
  })
})

describe('advisor page', () => {
  const search = (query: Record<string, string>) => ({ searchParams: params(query) })

  it('plans on the server and opens the view and bucket the URL names', async () => {
    expect(await advisorMetadata()).toEqual({ title: 'Advisor' })
    await renderServer(AdvisorPage(search({ view: 'action' })))
    expect(screen.getByRole('link', { name: /^Action required/, current: 'page' })).toBeTruthy()
    expect(screen.getByText('Only admins can book people.')).toBeTruthy()
  })

  it('falls back to the breakdown of what is non-compliant now on anything unknown', async () => {
    signInAs('ADMIN')
    await renderServer(AdvisorPage(search({ view: 'nonsense', bucket: '1999-01' })))
    expect(screen.getByRole('heading', { name: 'Non-compliant now: 2 trainings' })).toBeTruthy()
  })
})
