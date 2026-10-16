// @vitest-environment jsdom
import { getAdvisorInput, getSession, listRoomOptions, listSessions } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { removeAssignmentAction } from '@/server/actions/assignments'
import { getViewer, requirePageUser } from '@/server/auth'
import { advisorInput, AULA_A, ONLINE, session } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import AdvisorPage, { generateMetadata as advisorMetadata } from '../advisor/page'
import EditSessionPage from './[externalId]/edit/page'
import SessionPage, { generateMetadata as sessionMetadata } from './[externalId]/page'
import SessionsPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  listRoomOptions: vi.fn(),
  getAdvisorInput: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({ saveSession: vi.fn() }))
vi.mock('@/server/actions/assignments', () => ({
  applyAssignmentsAction: vi.fn(),
  moveSeatsAction: vi.fn(),
  removeAssignmentAction: vi.fn(() => Promise.resolve(true)),
}))

const online = session({
  externalId: 'T020',
  courseCode: 'GDPR',
  courseName: 'Ochrana osobních údajů',
  room: ONLINE,
  capacity: 100,
  unnamedBookings: 12,
  assigned: [],
  bookedCount: 12,
  pricePerPerson: null,
})

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  vi.mocked(requirePageUser).mockResolvedValue('user_1')
  vi.mocked(listSessions).mockResolvedValue([
    session(),
    online,
    session({
      externalId: 'T030',
      bookedCount: 31,
      unnamedBookings: 31,
      assigned: [],
      capacity: 30,
    }),
  ])
  vi.mocked(getSession).mockResolvedValue(session())
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
  vi.mocked(listRoomOptions).mockResolvedValue([
    { ...AULA_A, capacity: 40 },
    { ...ONLINE, capacity: null },
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
    expect(within(row).getByLabelText('Online')).toBeTruthy()
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
    expect(screen.getByRole('link', { name: 'All locations' }).getAttribute('href')).toBe(
      '/sessions?when=past'
    )
  })

  it('opens a session row to the people booked by name', async () => {
    const user = userEvent.setup()
    await renderServer(SessionsPage(search({})))
    // Only sessions with named bookings open.
    expect(
      within(screen.getByRole('row', { name: /T020/ })).queryByRole('button', {
        name: /Who is booked/,
      })
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Who is booked on T016' }))
    expect(
      screen.getByText('1 person booked by name, 29 seats booked without a name.')
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
  })

  it('ignores a room that does not exist', async () => {
    expect(await listMetadata(search({ room: 'gone' }))).toEqual({ title: 'Sessions' })
    await renderServer(SessionsPage(search({ room: 'gone' })))
    expect(listSessions).toHaveBeenCalledWith({ window: 'upcoming', room: undefined })
  })

  it('says when there is nothing to show', async () => {
    vi.mocked(listSessions).mockResolvedValue([])
    await renderServer(SessionsPage(search({})))
    expect(screen.getByText('No sessions to show.')).toBeTruthy()
  })
})

describe('session detail', () => {
  const props = { params: params({ externalId: 'T016' }) }

  it('is titled by course and date, or by the ID when unknown', async () => {
    expect(await sessionMetadata(props)).toEqual({ title: 'BOZP – základní školení · Nov 4, 2026' })
    vi.mocked(getSession).mockResolvedValue(null)
    expect(await sessionMetadata({ params: params({ externalId: 'T999' }) })).toEqual({
      title: 'T999',
    })
    await expect(SessionPage({ params: params({ externalId: 'T999' }) })).rejects.toThrow(
      NotFoundError
    )
  })

  it('shows the facts, seats and named bookings, read-only for visitors', async () => {
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

  it('lets signed-in users edit the session and cancel a booking', async () => {
    const user = userEvent.setup()
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    await renderServer(SessionPage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/sessions/T016/edit'
    )
    await expectNoAxeViolations()
    await user.click(screen.getByRole('button', { name: 'Cancel the booking of Černá Marie' }))
    expect(removeAssignmentAction).toHaveBeenCalledWith({
      sessionExternalId: 'T016',
      employeeExternalId: 'E0153',
    })
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

  it('edits a session for signed-in users, listing the people booked by name', async () => {
    await renderServer(EditSessionPage(props))
    expect(requirePageUser).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Edit session T016' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Room/ }).textContent).toContain('Aula A')
    expect(screen.getByRole('link', { name: 'Černá Marie' })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('is a 404 for an unknown session, and says when nobody is named', async () => {
    vi.mocked(getSession).mockResolvedValue(online)
    await renderServer(EditSessionPage(props))
    expect(
      screen.getByText('Nobody is booked by name yet; the advisor can suggest people.')
    ).toBeTruthy()
    vi.mocked(getSession).mockResolvedValue(null)
    await expect(EditSessionPage(props)).rejects.toThrow(NotFoundError)
  })
})

describe('advisor page', () => {
  const search = (query: Record<string, string>) => ({ searchParams: params(query) })

  it('plans on the server and opens the view and bucket the URL names', async () => {
    expect(await advisorMetadata()).toEqual({ title: 'Advisor' })
    await renderServer(AdvisorPage(search({ view: 'action' })))
    expect(screen.getByRole('link', { name: /^Action required/, current: 'page' })).toBeTruthy()
    expect(screen.getByText('Sign in to save bookings.')).toBeTruthy()
  })

  it('falls back to the breakdown of what is non-compliant now on anything unknown', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    await renderServer(AdvisorPage(search({ view: 'nonsense', bucket: '1999-01' })))
    expect(screen.getByRole('heading', { name: 'Non-compliant now: 2 trainings' })).toBeTruthy()
  })
})
