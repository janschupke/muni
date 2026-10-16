// @vitest-environment jsdom
import { getAdvisorInput, getPlannerInput } from '@muni/db/repositories'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createOfferedSession } from '@/server/actions/sessions'
import { getViewer } from '@/server/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { advisorInput, plannerInput } from '@/test/fixtures'
import { router } from '@/test/next'
import { renderClient, renderServer } from '@/test/render'
import { PlannerView } from '@/features/planner/planner-view'
import type { SessionOffer } from '@muni/domain/planner'

import PlannerPage, { generateMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getAdvisorInput: vi.fn(),
  getPlannerInput: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/sessions', () => ({
  createOfferedSession: vi.fn(),
  saveNewSession: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  // POZ-OCH has nothing scheduled: Adámek Petr needs a new session.
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
  vi.mocked(getPlannerInput).mockResolvedValue(plannerInput())
})

describe('session planner', () => {
  it('proposes a session per course that needs one, with its slot, room and people', async () => {
    const user = userEvent.setup()
    expect(await generateMetadata()).toEqual({ title: 'Session planner' })
    await renderServer(PlannerPage())
    expect(screen.getByText('Sign in to create sessions.')).toBeTruthy()
    const section = screen.getByRole('region', { name: 'Požární ochrana' })
    expect(
      within(section).getByRole('link', { name: 'Požární ochrana' }).getAttribute('href')
    ).toBe('/courses/POZ-OCH')
    expect(within(section).getByText('120 min · groups of 40 · needs Projector')).toBeTruthy()
    const row = within(section).getAllByRole('row')[1] as HTMLElement
    expect(within(row).getByText('Oct 30, 2026')).toBeTruthy()
    expect(within(row).getByText('Lapsed now')).toBeTruthy()
    expect(within(row).getByText(/Oct 19, 2026, 10:00/)).toBeTruthy()
    expect(within(row).getByRole('link', { name: 'Aula A' }).getAttribute('href')).toBe(
      '/rooms/room_aula_a'
    )
    expect(within(row).getByText('1 · 40')).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Create session' })).toBeNull()
    await user.click(
      within(row).getByRole('button', { name: 'People for Požární ochrana, session 1' })
    )
    expect(screen.getByRole('link', { name: 'Adámek Petr' }).getAttribute('href')).toBe(
      '/employees/E0002'
    )
    await expectNoAxeViolations()
  })

  it('says why it cannot offer a slot, and when it is late', async () => {
    vi.mocked(getPlannerInput).mockResolvedValue(
      plannerInput({
        rooms: [
          { id: 'small', name: 'Kabinet', kind: 'CLASSROOM', capacity: 40, capabilities: [] },
        ],
      })
    )
    await renderServer(PlannerPage())
    expect(screen.getByText('No room has Projector.')).toBeTruthy()
  })

  it('says when nothing needs a new session', async () => {
    vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput({ needs: [] }))
    await renderServer(PlannerPage())
    expect(screen.getByText('Every training that needs a session has one.')).toBeTruthy()
  })

  it('lets signed-in users create the offered session, and says when it fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    vi.mocked(createOfferedSession).mockResolvedValueOnce({ ok: true, externalId: 'T035' })
    await renderServer(PlannerPage())
    await user.click(screen.getByRole('button', { name: 'Create session' }))
    expect(createOfferedSession).toHaveBeenCalledWith({
      courseCode: 'POZ-OCH',
      date: '2026-10-19',
      startTime: '10:00',
      endTime: '12:00',
      roomId: 'room_aula_a',
      capacity: 40,
      pricePerPerson: null,
      status: 'PLANNED',
    })
    expect(await screen.findByText(/Created session T035\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open it' }).getAttribute('href')).toBe(
      '/sessions/T035'
    )
    expect(router.refresh).toHaveBeenCalled()

    vi.mocked(createOfferedSession).mockResolvedValueOnce({ ok: false })
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create session' }))
    })
    expect(await screen.findByText('The session could not be created. Try again.')).toBeTruthy()
  })
})

describe('planner offers', () => {
  const offer = (over: Partial<SessionOffer>): SessionOffer => ({
    id: 'GDPR|2026-12|1',
    course: { code: 'GDPR', name: 'Ochrana osobních údajů' },
    bucket: '2026-12',
    deadline: '2026-12-02',
    size: 12,
    capacity: 100,
    people: [{ externalId: 'E0007', name: 'Novák Jan', department: null, lapses: '2026-12-03' }],
    slot: null,
    room: null,
    alternatives: [],
    late: false,
    problem: null,
    ...over,
  })

  it('mark a late slot, count the other rooms, and explain every kind of failure', () => {
    renderClient(
      <PlannerView
        canCreate
        groups={[
          {
            course: {
              code: 'GDPR',
              name: 'Ochrana osobních údajů',
              sessionMinutes: null,
              groupSize: null,
              onlineAllowed: true,
              capabilities: [],
            },
            offers: [
              offer({
                slot: {
                  date: '2026-12-07',
                  startTime: '14:00',
                  endTime: '16:00',
                  startsAt: '2026-12-07T13:00:00.000Z',
                  endsAt: '2026-12-07T15:00:00.000Z',
                },
                room: { id: 'room_online', name: 'Online', kind: 'ONLINE' },
                alternatives: [
                  { id: 'a', name: 'A', kind: 'CLASSROOM' },
                  { id: 'b', name: 'B', kind: 'CLASSROOM' },
                ],
                late: true,
              }),
              offer({
                id: '2',
                problem: { kind: 'NO_ROOM_LARGE_ENOUGH', largest: 8 },
                capacity: null,
              }),
              offer({ id: '3', problem: { kind: 'NO_FREE_SLOT' }, capacity: null }),
              offer({ id: '4', problem: { kind: 'NO_ONLINE_OR_ROOM' }, capacity: null }),
            ],
          },
        ]}
      />
    )
    expect(screen.getByText('180 min · one group · can be online')).toBeTruthy()
    expect(screen.getAllByText('Lapsing in December 2026')).toHaveLength(4)
    expect(screen.getByText('After the due date')).toBeTruthy()
    expect(screen.getByText('or 2 other rooms')).toBeTruthy()
    expect(screen.getByText('No room seats 12; the largest takes 8.')).toBeTruthy()
    expect(screen.getByText('No free slot in the next 120 days.')).toBeTruthy()
    expect(screen.getByText('No room can hold it.')).toBeTruthy()
    // Only the offer with a slot can be created.
    expect(screen.getAllByRole('button', { name: 'Create session' })).toHaveLength(1)
    expect(screen.getAllByText('12')).toHaveLength(3)
  })
})
