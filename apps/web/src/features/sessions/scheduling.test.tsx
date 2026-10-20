// @vitest-environment jsdom
import { getAdvisorInput, getSession } from '@muni/db/repositories'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CoursesTable } from '@/features/courses/courses-table'
import { ProviderOfferingsTable } from '@/features/providers/provider-offerings-table'
import { RoomFitTable } from '@/features/rooms/room-fit-table'
import { SessionTable } from '@/features/sessions/session-table'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { advisorInput, courseRow, providerDetail, roomDetail, session } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { ScheduleSessionButton } from './schedule-button'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getAdvisorInput: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/assignments', () => ({
  addBookingAction: vi.fn(),
  removeAssignmentAction: vi.fn(),
}))

beforeEach(() => {
  signInAs('ADMIN')
})
afterEach(() => {
  vi.clearAllMocks()
})

const reasonOf = (button: HTMLElement) =>
  document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent

describe('scheduling a session, the same from everywhere', () => {
  it('opens the course’s session form with what the place knows, or says why it cannot', () => {
    renderClient(
      <>
        <ScheduleSessionButton course="BOZP-Z" block={null} />
        <ScheduleSessionButton course="LAB-BEZ" room="r1" provider="p1" block={null} />
        <ScheduleSessionButton course="ANGL" block="NO_PROVIDER" label="Schedule ANGL" />
      </>
    )
    const links = screen.getAllByRole('link', { name: 'Schedule session' })
    expect(links.map(l => l.getAttribute('href'))).toEqual([
      '/courses/BOZP-Z/sessions/new',
      '/courses/LAB-BEZ/sessions/new?room=r1&provider=p1',
    ])
    const blocked = screen.getByRole('button', { name: 'Schedule ANGL' })
    expect(blocked.getAttribute('aria-disabled')).toBe('true')
    expect(reasonOf(blocked)).toBe(
      'No provider offers the course: add it to a provider’s offered courses first'
    )
  })

  it('from a course’s row, a room’s course fit and a provider’s offerings', () => {
    renderClient(
      <>
        <CoursesTable
          courses={[courseRow(), courseRow({ code: 'ANGL', name: 'Angličtina', offerings: [] })]}
          paging={{ local: 'a test' }}
          canEdit
        />
        <RoomFitTable room={roomDetail()} canEdit />
        <ProviderOfferingsTable
          providerId="prov_vzor"
          providerName="Vzorový školicí ústav"
          rows={providerDetail().offerings}
          canEdit
        />
      </>
    )
    expect(
      screen
        .getByRole('link', { name: 'Schedule a session of BOZP – základní školení' })
        .getAttribute('href')
    ).toBe('/courses/BOZP-Z/sessions/new')
    expect(reasonOf(screen.getByRole('button', { name: 'Schedule a session of Angličtina' }))).toBe(
      'No provider offers the course: add it to a provider’s offered courses first'
    )
    // In the room: the room goes along; a course with no length cannot be scheduled.
    const room = roomDetail()
    expect(
      screen
        .getByRole('link', {
          name: `Schedule a session of BOZP – základní školení in ${room.name}`,
        })
        .getAttribute('href')
    ).toBe(`/courses/BOZP-Z/sessions/new?room=${room.id}`)
    expect(
      reasonOf(
        screen.getByRole('button', { name: `Schedule a session of Angličtina in ${room.name}` })
      )
    ).toBe('The course has no length set: set it on the course first')
    // With the provider: it goes along.
    expect(
      screen
        .getByRole('link', {
          name: 'Schedule a session of BOZP – základní školení with Vzorový školicí ústav',
        })
        .getAttribute('href')
    ).toBe('/courses/BOZP-Z/sessions/new?provider=prov_vzor')
  })

  it('is not offered to readers', () => {
    renderClient(<RoomFitTable room={roomDetail()} />)
    expect(screen.queryByRole('link', { name: /^Schedule/ })).toBeNull()
  })
})

describe('a session’s opened row', () => {
  it('books someone who needs the course, and cancels a booking, as its page does', async () => {
    const user = userEvent.setup()
    const t016 = session()
    vi.mocked(getSession).mockResolvedValue(t016)
    vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
    renderClient(<SessionTable sessions={[t016]} paging={{ local: 'a test' }} canEdit />)
    await user.click(screen.getByRole('button', { name: 'Who is booked on T016' }))
    // What the course's sessions are, and who holds this one.
    expect(screen.getByText(/^180 min · 30 seats/)).toBeTruthy()
    // In its row's column and among its facts.
    for (const link of screen.getAllByRole('link', { name: 'Interní školitel' }))
      expect(link.getAttribute('href')).toBe('/providers/prv_internal')
    const people = screen.getByRole('heading', { name: /^Booked by name/ }).closest('section')
    if (!people) throw new Error('no people panel')
    // The people who need the course, read as the row opens.
    await waitFor(() => {
      expect(within(people).getByRole('combobox', { name: /Person to book/ })).toHaveProperty(
        'disabled',
        false
      )
    })
    expect(getAdvisorInput).toHaveBeenCalled()
    expect(
      within(people).getByRole('button', { name: 'Cancel the booking of Černá Marie' })
    ).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('shows readers who is booked, and nothing to change', async () => {
    const user = userEvent.setup()
    signInAs('VIEWER')
    renderClient(
      <SessionTable sessions={[session()]} paging={{ local: 'a test' }} canEdit={false} />
    )
    await user.click(screen.getByRole('button', { name: 'Who is booked on T016' }))
    expect(screen.queryByRole('combobox', { name: /Person to book/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel the booking/ })).toBeNull()
    expect(getAdvisorInput).not.toHaveBeenCalled()
  })
})
