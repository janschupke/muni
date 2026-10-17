// @vitest-environment jsdom
import { getAdvisorInput, getPlannerInput, listRoomOptions } from '@muni/db/repositories'
import type { SessionOffer } from '@muni/domain/planner'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlannerView } from '@/features/planner/planner-view'
import { checkSessionSlotAction, createPlannedSessionAction } from '@/server/actions/sessions'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { advisorInput, plannerInput } from '@/test/fixtures'
import { params, renderClient, renderServer } from '@/test/render'

import PlannerPage, { generateMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getAdvisorInput: vi.fn(),
  getPlannerInput: vi.fn(),
  listRoomOptions: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/sessions', () => ({
  createPlannedSessionAction: vi.fn(),
  checkSessionSlotAction: vi.fn(() => Promise.resolve(null)),
  saveNewSession: vi.fn(),
}))

beforeEach(() => {
  signInAs('VIEWER')
  // POZ-OCH has nothing scheduled: Adámek Petr needs a new session.
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
  vi.mocked(getPlannerInput).mockResolvedValue(plannerInput())
  vi.mocked(listRoomOptions).mockResolvedValue([...plannerInput().rooms])
})

describe('session planner', () => {
  it('proposes a session per course that needs one, with its slot, room and people', async () => {
    const user = userEvent.setup()
    expect(await generateMetadata()).toEqual({ title: 'Session planner' })
    await renderServer(PlannerPage({ searchParams: params({}) }))
    expect(screen.getByText('Only admins can create sessions.')).toBeTruthy()
    const section = screen.getByRole('region', { name: 'Požární ochrana' })
    expect(
      within(section).getByRole('link', { name: 'Požární ochrana' }).getAttribute('href')
    ).toBe('/courses/POZ-OCH')
    expect(within(section).getByText('120 min · groups of 40 · needs Projector')).toBeTruthy()
    const row = within(section).getAllByRole('row')[1] as HTMLElement
    expect(within(row).getByText('30.10.2026')).toBeTruthy()
    expect(within(row).getByText('Lapsed now')).toBeTruthy()
    expect(within(row).getByText(/19.10.2026 10:00/)).toBeTruthy()
    expect(within(row).getByRole('link', { name: 'Aula A' }).getAttribute('href')).toBe(
      '/rooms/room_aula_a'
    )
    expect(within(row).getByText('1 · 40')).toBeTruthy()
    expect(within(row).queryByRole('button', { name: /^Review/ })).toBeNull()
    await user.click(
      within(row).getByRole('button', { name: 'People for Požární ochrana, session 1' })
    )
    // Opened: the people as a table, and the other rooms free then.
    const people = screen.getByRole('table', { name: 'People' })
    expect(within(people).getByRole('link', { name: 'Adámek Petr' }).getAttribute('href')).toBe(
      '/employees/E0002'
    )
    expect(screen.getByRole('heading', { level: 3, name: /Other rooms free then/ })).toBeTruthy()
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
    await renderServer(PlannerPage({ searchParams: params({}) }))
    expect(screen.getByText('Even the best-equipped room lacks Projector.')).toBeTruthy()
  })

  it('says when nothing needs a new session', async () => {
    vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput({ needs: [] }))
    await renderServer(PlannerPage({ searchParams: params({}) }))
    expect(screen.getByText('Every training that needs a session has one.')).toBeTruthy()
  })

  it('lets admins change the offer, checks it, shows what will happen, then creates it', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    await renderServer(PlannerPage({ searchParams: params({}) }))
    await user.click(screen.getByRole('button', { name: 'Review session 1 of Požární ochrana' }))
    const dialog = await screen.findByRole('dialog', { name: 'New session: Požární ochrana' })
    // The offer, ready to change: its seats, and its people ticked.
    expect(within(dialog).getByRole('textbox', { name: /Capacity/ })).toHaveProperty('value', '40')
    expect(
      within(dialog)
        .getByRole('checkbox', { name: /Adámek Petr/ })
        .getAttribute('aria-checked')
    ).toBe('true')
    await user.type(within(dialog).getByRole('textbox', { name: /Price per person/ }), '380')
    await expectNoAxeViolations()

    // The check runs everything on the server and writes nothing; a refusal names the person.
    vi.mocked(createPlannedSessionAction).mockResolvedValueOnce({
      ok: false,
      problem: null,
      refusals: [{ employeeExternalId: 'E0002', reason: 'CONFLICT' }],
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(createPlannedSessionAction).toHaveBeenLastCalledWith({
      session: {
        courseId: 'course_poz',
        date: '2026-10-19',
        startTime: '10:00',
        endTime: '12:00',
        roomId: 'room_aula_a',
        capacity: 40,
        pricePerPerson: 380,
      },
      people: ['E0002'],
      dryRun: true,
    })
    expect(
      await within(dialog).findByText('Adámek Petr: clashes with another booking')
    ).toBeTruthy()

    // Checked clean: the review says exactly what will be created.
    vi.mocked(createPlannedSessionAction).mockResolvedValueOnce({
      ok: true,
      externalId: 'S001',
      courseCode: 'POZ-OCH',
      booked: 1,
      dryRun: true,
    })
    const check = within(dialog).getByRole('button', { name: 'Check' })
    await waitFor(() => {
      expect(check).toHaveProperty('disabled', false)
    })
    await user.click(check)
    expect(await within(dialog).findByText('What will be created')).toBeTruthy()
    // Price per person, and the cost of the one booking.
    expect(within(dialog).getAllByText('380,00 Kč')).toHaveLength(2)
    vi.mocked(createPlannedSessionAction).mockResolvedValueOnce({
      ok: true,
      externalId: 'S001',
      courseCode: 'POZ-OCH',
      booked: 1,
      dryRun: false,
    })
    await user.click(
      await within(dialog).findByRole('button', { name: 'Create session and book 1 person' })
    )
    expect(createPlannedSessionAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ dryRun: false, people: ['E0002'] })
    )
    expect(await screen.findByText('Created S001 and booked 1 person')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open session' }).getAttribute('href')).toBe(
      '/sessions/S001'
    )
  })

  it('will not check a session whose room is taken then', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    await renderServer(PlannerPage({ searchParams: params({}) }))
    await user.click(screen.getByRole('button', { name: 'Review session 1 of Požární ochrana' }))
    const dialog = await screen.findByRole('dialog', { name: 'New session: Požární ochrana' })
    expect(
      await within(dialog).findByText(
        'Another planned session uses this room at that time.',
        {},
        { timeout: 2000 }
      )
    ).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Check' })).toHaveProperty('disabled', true)
  })
})

describe('planner offers', () => {
  const offer = (over: Partial<SessionOffer>): SessionOffer => ({
    id: 'GDPR|2026-12|1',
    course: {
      id: 'course_gdpr',
      code: 'GDPR',
      name: 'Ochrana osobních údajů',
      sessionMinutes: null,
      groupSize: null,
      onlineAllowed: true,
      capabilities: [],
    },
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

  it('mark a late slot, name the other rooms, and explain every kind of failure', () => {
    renderClient(
      <PlannerView
        paging={{ local: 'the offers a test gives' }}
        canCreate
        rooms={[]}
        groups={[
          {
            course: {
              id: 'course_gdpr',
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
              offer({ id: '5', problem: { kind: 'RUNS_PAST_MIDNIGHT' }, capacity: null }),
            ],
          },
        ]}
      />
    )
    expect(screen.getByText('180 min · as many as the room seats · can be online')).toBeTruthy()
    expect(screen.getAllByText('Lapsing in December 2026')).toHaveLength(5)
    expect(screen.getByText('After the due date')).toBeTruthy()
    expect(screen.getByText('or A, B')).toBeTruthy()
    expect(screen.getByText('No equipped room seats 12 people; the largest takes 8.')).toBeTruthy()
    expect(screen.getByText('No free slot in the next 120 days.')).toBeTruthy()
    expect(screen.getByText('The course is held on site, and there is no room.')).toBeTruthy()
    expect(
      screen.getByText('At its usual time and length a session would end after midnight.')
    ).toBeTruthy()
    // Only the offer with a slot can be reviewed.
    expect(screen.getAllByRole('button', { name: /^Review session/ })).toHaveLength(1)
    expect(screen.getAllByText('12')).toHaveLength(4)
  })
})
