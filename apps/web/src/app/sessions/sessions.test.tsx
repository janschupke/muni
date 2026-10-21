// @vitest-environment jsdom
import {
  getAdvisorInput,
  getSession,
  listCourseOptions,
  listRoomOptions,
  listSessions,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { removeAssignmentAction } from '@/server/actions/assignments'
import { requireAdminPage } from '@/server/auth'
import { signInAs, signOut } from '@/test/auth'
import { advisorInput, AULA_A, EXTERNAL, INTERNAL, ONLINE, session } from '@/test/fixtures'
import { NotFoundError, route, router } from '@/test/next'
import { params, renderServer } from '@/test/render'

import EditSessionPage, { generateMetadata as editSessionMetadata } from './[externalId]/edit/page'
import SessionPage, { generateMetadata as sessionMetadata } from './[externalId]/page'
import NewSessionsPage, { generateMetadata as newSessionMetadata } from './new/page'
import SessionsPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  listRoomOptions: vi.fn(),
  listCourseOptions: vi.fn(),
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
      needs: { sessionMinutes: 180, seats: 30, onlineAllowed: true, capabilities: [] },
      offerings: [INTERNAL, EXTERNAL],
    },
  ])
})

/**
 * Who needs BOZP-Z: Urbanová (expired) and Adámek (never held) have nothing booked; Černá is
 * booked on T016 already.
 */
const NEEDING = (() => {
  const input = advisorInput()
  const [needed] = input.needs
  const [t016, ...others] = input.sessions
  if (!needed || !t016) throw new Error('fixture')
  const person = (externalId: string, name: string) => ({
    ...needed.employee,
    externalId,
    name,
  })
  return advisorInput({
    needs: [
      { ...needed, employee: person('E0001', 'Urbanová Tereza') },
      { ...needed, employee: person('E0153', 'Černá Marie') },
      { ...needed, employee: person('E0002', 'Adámek Petr'), status: 'MISSING', validUntil: null },
    ],
    sessions: [{ ...t016, assigned: ['E0153'], unnamedBookings: 0 }, ...others],
  })
})()

describe('session list', () => {
  // The address the page is read from, and the one its view reads in the browser.
  const search = (query: Record<string, string>) => {
    route.pathname = '/sessions'
    route.search = new URLSearchParams(query).toString()
    return { searchParams: params(query) }
  }

  it('lists upcoming sessions, linking the date to the session and the place to its room', async () => {
    expect(await listMetadata(search({}))).toEqual({ title: 'Sessions' })
    await renderServer(SessionsPage(search({})))
    expect(listSessions).toHaveBeenCalledWith({
      window: 'upcoming',
      room: undefined,
      course: undefined,
    })
    expect(screen.getByRole('link', { name: 'Upcoming' }).getAttribute('aria-current')).toBe('page')
    const row = screen.getByRole('row', { name: /T020/ })
    expect(within(row).getByRole('link', { name: 'Online' }).getAttribute('href')).toBe(
      '/rooms/room_online'
    )
    expect(within(row).getByText('Online', { selector: '.sr-only' })).toBeTruthy()
    expect(
      within(row)
        .getByRole('link', { name: /04.11.2026/ })
        .getAttribute('href')
    ).toBe('/sessions/T020')
    expect(within(row).getByText('—')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /T030/ })).getByText('Overbooked')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /T016/ })).getByText('Full')).toBeTruthy()
  })

  it('names no room or course in the title for a visitor: nothing read before the guard', async () => {
    signOut()
    expect(await listMetadata(search({ room: 'room_aula_a', course: 'BOZP-Z' }))).toEqual({
      title: 'Sessions',
    })
    expect(listRoomOptions).not.toHaveBeenCalled()
    expect(listCourseOptions).not.toHaveBeenCalled()
  })

  it('filters by room and keeps it across the upcoming/past tabs', async () => {
    expect(await listMetadata(search({ room: 'room_aula_a' }))).toEqual({
      title: 'Sessions in Aula A',
    })
    await renderServer(SessionsPage(search({ when: 'past', room: 'room_aula_a' })))
    expect(listSessions).toHaveBeenCalledWith({
      window: 'past',
      room: 'room_aula_a',
      course: undefined,
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Sessions in Aula A' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Upcoming' }).getAttribute('href')).toBe(
      '/sessions?room=room_aula_a'
    )
    expect(screen.getByRole('link', { name: 'Past' }).getAttribute('aria-current')).toBe('page')
    // The room filter shows the room; choosing all rooms keeps the past tab.
    const filter = screen.getByRole('combobox', { name: 'Room' })
    expect(filter.textContent).toContain('Aula A')
    await userEvent.setup().click(filter)
    await userEvent.setup().click(screen.getByRole('option', { name: 'All rooms' }))
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
  })

  it('shows nothing for a room that does not exist', async () => {
    expect(await listMetadata(search({ room: 'gone' }))).toEqual({ title: 'Sessions' })
    await renderServer(SessionsPage(search({ room: 'gone' })))
    expect(screen.getByRole('heading', { level: 1, name: 'Sessions' })).toBeTruthy()
    expect(screen.getByText('No sessions to show.')).toBeTruthy()
  })

  it('pages and sorts on the server, and narrows to one course with a chip that removes it', async () => {
    // Sixty past sessions, the latest first: T060 … T001.
    vi.mocked(listSessions).mockResolvedValue(
      Array.from({ length: 60 }, (_, i) =>
        session({ externalId: `T${String(60 - i).padStart(3, '0')}` })
      )
    )
    const query = { when: 'past', course: 'BOZP-Z', page: '2' }
    expect(await listMetadata(search(query))).toEqual({
      title: 'Sessions of BOZP – základní školení',
    })
    await renderServer(SessionsPage(search(query)))
    expect(listSessions).toHaveBeenCalledWith({ window: 'past', room: undefined, course: 'BOZP-Z' })
    // The second page of 25 comes from the server: T035 … T011.
    const ids = () =>
      screen
        .getAllByRole('button', { name: /^Who is booked on/ })
        .map(b => b.getAttribute('aria-label')?.slice(-4))
    expect(ids()).toHaveLength(25)
    expect(ids()[0]).toBe('T035')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sessions of BOZP – základní školení' })
    ).toBeTruthy()
    const pages = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(pages).getByText('Page 2 of 3')).toBeTruthy()
    // A header asks the server for its order, from the first page, the filters kept.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Date' }))
    expect(router.push).toHaveBeenLastCalledWith('/sessions?when=past&course=BOZP-Z&sort=date', {
      scroll: false,
    })
    // Page 1 is the list without a page; the filters stay on every page.
    expect(
      within(pages)
        .getByRole('link', { name: /Previous/ })
        .getAttribute('href')
    ).toBe('/sessions?when=past&course=BOZP-Z')
    expect(within(pages).getByRole('link', { name: /Next/ }).getAttribute('href')).toBe(
      '/sessions?when=past&course=BOZP-Z&page=3'
    )
    expect(screen.getByText('Course: BOZP – základní školení')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Remove the course filter' }).getAttribute('href')
    ).toBe('/sessions?when=past')
    // Another window starts again from the first page.
    expect(screen.getByRole('link', { name: 'Upcoming' }).getAttribute('href')).toBe(
      '/sessions?course=BOZP-Z'
    )
  })

  it('shows nothing for a course that does not exist', async () => {
    await renderServer(SessionsPage(search({ course: 'GONE' })))
    expect(screen.getByText('No sessions to show.')).toBeTruthy()
  })

  it('says when there is nothing to show', async () => {
    vi.mocked(listSessions).mockResolvedValue([])
    await renderServer(SessionsPage(search({})))
    expect(screen.getByText('No sessions to show.')).toBeTruthy()
  })
})

describe('session detail', () => {
  const props = { params: params({ externalId: 'T016' }), searchParams: params({}) }

  it('is titled by course and date once its data is there; an unknown ID is not found', async () => {
    expect(await sessionMetadata(props)).toEqual({ title: 'BOZP – základní školení · 04.11.2026' })
    await renderServer(SessionPage(props))
    expect(document.title).toBe('BOZP – základní školení · 04.11.2026 · Training register')
    vi.mocked(getSession).mockResolvedValueOnce(null)
    await expect(
      renderServer(
        SessionPage({ params: params({ externalId: 'T999' }), searchParams: params({}) })
      )
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
    expect(screen.getByText('1 by name · 29 without a name · none free')).toBeTruthy()
    // Everything the opened row shows: whether the room suits it, and who each person is.
    expect(screen.getByText('The room suits it.')).toBeTruthy()
    const people = screen.getByRole('table', { name: 'Booked by name' })
    expect(within(people).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(people).getByText('Advisor')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel the booking/ })).toBeNull()
  })

  it('lets admins edit the session, book people and cancel a booking', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    vi.mocked(getAdvisorInput).mockResolvedValue(NEEDING)
    await renderServer(SessionPage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/sessions/T016/edit'
    )
    // Still to start: cancelled, not archived.
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel session…' })).toBeTruthy()
    // Only who needs the course and has nothing booked: not the booked one, not the valid one.
    await user.click(screen.getByRole('combobox', { name: 'Person to book' }))
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'Urbanová Tereza · expired 01.09.2026',
      'Adámek Petr · never held',
    ])
    await user.keyboard('{Escape}')
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

  it('starts the booking with the person a link names, when they are on offer', async () => {
    signInAs('ADMIN')
    vi.mocked(getAdvisorInput).mockResolvedValue(NEEDING)
    const page = (employee: string) =>
      SessionPage({ params: params({ externalId: 'T016' }), searchParams: params({ employee }) })
    const { unmount } = await renderServer(page('E0001'))
    expect(screen.getByRole('combobox', { name: 'Person to book' }).textContent).toBe(
      'Urbanová Tereza · expired 01.09.2026'
    )
    unmount()
    // Černá Marie is booked already: not on offer, so the form starts empty.
    await renderServer(page('E0153'))
    expect(screen.getByRole('combobox', { name: 'Person to book' }).textContent).toBe('Choose…')
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
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit T016 · BOZP – základní školení' })
    ).toBeTruthy()
    expect(await editSessionMetadata(props)).toEqual({
      title: 'Edit T016 · BOZP – základní školení',
    })
    expect(screen.getByRole('combobox', { name: /Room/ }).textContent).toContain('Aula A')
    // Its course can change too.
    expect(screen.getByRole('combobox', { name: /Course/ }).textContent).toContain('BOZP-Z')
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/sessions/T016')
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
                  seats: 10,
                  onlineAllowed: false,
                  capabilities: [],
                },
                offerings: [INTERNAL],
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
  })
})
