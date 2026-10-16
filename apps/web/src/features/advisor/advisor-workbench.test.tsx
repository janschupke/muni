// @vitest-environment jsdom
import {
  type AdvisorInput,
  type AdvisorNeed,
  type AdvisorSession,
  planAssignments,
} from '@muni/domain/advisor'
import { TooltipProvider } from '@muni/ui/tooltip'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/messages/en.json'
import { expectNoAxeViolations } from '@/test/axe'

import { AdvisorWorkbench } from './advisor-workbench'

const actions = vi.hoisted(() => ({
  applyAssignmentsAction: vi.fn((pairs: unknown[]) =>
    Promise.resolve({ applied: pairs.length, failed: [] as unknown[] })
  ),
  moveSeatsAction: vi.fn((): Promise<{ ok: boolean }> => Promise.resolve({ ok: true })),
  removeAssignmentAction: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/actions/assignments', () => actions)
const { applyAssignmentsAction, moveSeatsAction, removeAssignmentAction } = actions

afterEach(() => {
  vi.clearAllMocks()
})

const session = (
  id: string,
  date: string,
  extra: Partial<AdvisorSession> = {}
): AdvisorSession => ({
  externalId: id,
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  room: { id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM' as const },
  startsAt: `${date}T07:00:00.000Z`,
  endsAt: `${date}T10:00:00.000Z`,
  capacity: 1,
  unnamedBookings: 0,
  assigned: [],
  pricePerPerson: 450,
  status: 'PLANNED',
  ...extra,
})

const need = (
  externalId: string,
  name: string,
  status: AdvisorNeed['status'],
  validUntil: string | null
): AdvisorNeed => ({
  employee: { externalId, name, department: 'Laboratoře', status: 'ACTIVE' },
  course: { code: 'BOZP-Z', name: 'BOZP – základní školení' },
  status,
  validUntil,
})

const INPUT: AdvisorInput = {
  asOf: '2026-10-16',
  needs: [
    need('E0001', 'Adámek Petr', 'EXPIRED', '2026-09-01'),
    need('E0002', 'Bílá Jana', 'MISSING', null),
    // Valid through 30 Nov, booked on 10 Dec: nine days without it.
    need('E0003', 'Cibulka Ota', 'VALID', '2026-11-30'),
  ],
  sessions: [
    // One over capacity: its extra unnamed seat moves to T018, leaving one seat there.
    session('T016', '2026-11-04', { capacity: 2, unnamedBookings: 3 }),
    session('T018', '2026-11-20', { capacity: 2 }),
    session('T019', '2026-12-10', { capacity: 1, assigned: ['E0003'] }),
  ],
}
const PLAN = planAssignments(INPUT)

function renderWorkbench({
  view = 'breakdown',
  bucket = 'now',
  canApply = false,
  plan = PLAN,
}: {
  view?: 'breakdown' | 'action' | 'planned' | 'overbooked'
  bucket?: string
  canApply?: boolean
  plan?: ReturnType<typeof planAssignments>
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Prague">
      <TooltipProvider>
        <AdvisorWorkbench
          plan={plan}
          asOf={INPUT.asOf}
          view={view}
          bucket={bucket}
          canApply={canApply}
        />
      </TooltipProvider>
    </NextIntlClientProvider>
  )
}

const hrefOf = (name: string | RegExp, scope: HTMLElement = document.body) =>
  within(scope).getByRole('link', { name }).getAttribute('href')

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('AdvisorWorkbench', () => {
  it('breaks non-compliance down by month, each month linking to its trainings', () => {
    renderWorkbench()
    const nowLinks = screen.getAllByRole('link', { name: /^Non-compliant now/ })
    expect(nowLinks.map(a => a.getAttribute('href'))).toEqual(['/advisor', '/advisor'])
    expect(hrefOf(/^December 2026/)).toBe('/advisor?bucket=2026-12')
    expect(
      screen.getByRole('img', {
        name: /^Non-compliant now: Planned in time 0, Planned, with a gap 0, Action required 2/,
      })
    ).toBeTruthy()

    const table = screen.getByRole('table', { name: 'Non-compliant now: 2 trainings' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText(/is non-compliant today/)).toBeTruthy()
    const adamek = rowOf('Adámek Petr')
    expect(within(adamek).getByText('Action required')).toBeTruthy()
    expect(within(adamek).getByText('Sep 2, 2026 – open')).toBeTruthy()
    expect(hrefOf(/Nov 20, 2026/, adamek)).toBe('/sessions/T018')
    expect(within(rowOf('Bílá Jana')).getByText('Every session is full')).toBeTruthy()
  })

  it('shows a booking after the lapse as planned with a gap, and the gap in days', () => {
    renderWorkbench({ bucket: '2026-12' })
    expect(screen.getByText(/lapses in December 2026/)).toBeTruthy()
    const row = rowOf('Cibulka Ota')
    expect(within(row).getByText('Planned, with a gap')).toBeTruthy()
    expect(within(row).getByText('Dec 1, 2026 – Dec 10, 2026')).toBeTruthy()
    expect(within(row).getByText('9 days')).toBeTruthy()
  })

  it('lists what needs action with the proposed session, and links to everything named', () => {
    renderWorkbench({ view: 'action' })
    const adamek = rowOf('Adámek Petr')
    expect(hrefOf('Adámek Petr', adamek)).toBe('/employees/E0001')
    expect(hrefOf('BOZP – základní školení', adamek)).toBe('/courses/BOZP-Z')
    expect(hrefOf(/Nov 20, 2026/, adamek)).toBe('/sessions/T018')
    expect(hrefOf('Aula A', adamek)).toBe('/rooms/room_aula_a')
    expect(within(adamek).getByText('Without it until Nov 20, 2026')).toBeTruthy()

    const bila = rowOf('Bílá Jana')
    expect(within(bila).getByText('Every session is full')).toBeTruthy()
    expect(hrefOf('Schedule a session', bila)).toBe('/courses/BOZP-Z')
  })

  it('lets visitors look but not save', () => {
    renderWorkbench({ view: 'action' })
    expect(screen.getByText('Only admins can save bookings.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Save|^Book/ })).toBeNull()
  })

  it('saves a proposal as an advisor booking', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'action', canApply: true })
    await expectNoAxeViolations()
    await user.click(
      screen.getByRole('button', {
        name: 'Book Adámek Petr on BOZP – základní školení, Nov 20, 2026',
      })
    )
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      { sessionExternalId: 'T018', employeeExternalId: 'E0001', source: 'ADVISOR' },
    ])
    expect(await screen.findByText('1 booking saved.')).toBeTruthy()
  })

  it('links every view and count to its own URL', () => {
    renderWorkbench()
    const tabs = screen.getByRole('navigation', { name: 'Advisor views' })
    expect(hrefOf(/^Action required/, tabs)).toBe('/advisor?view=action')
    expect(hrefOf(/^Remediation planned/, tabs)).toBe('/advisor?view=planned')
    expect(hrefOf(/^Lapsing in the next 6 months/)).toBe('/advisor?bucket=2026-12')
  })

  it('shows overbooked sessions and where their seats go', () => {
    renderWorkbench({ view: 'overbooked' })
    expect(screen.getByText('3 of 2 · 1 over')).toBeTruthy()
    const move = screen.getByText(/Move 1 seat to/)
    expect(hrefOf(/Nov 20, 2026/, move)).toBe('/sessions/T018')
  })

  it('lists what is already booked, with the gap each booking leaves', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'planned' })
    const row = rowOf('Cibulka Ota')
    expect(hrefOf(/Dec 10, 2026/, row)).toBe('/sessions/T019')
    expect(within(row).getByText('Planned, with a gap')).toBeTruthy()
    expect(within(row).queryByRole('button')).toBeNull()

    renderWorkbench({ view: 'planned', canApply: true })
    await user.click(
      screen.getByRole('button', {
        name: 'Cancel the booking of Cibulka Ota on BOZP – základní školení',
      })
    )
    // It asks first.
    expect(removeAssignmentAction).not.toHaveBeenCalled()
    const confirm = await screen.findByRole('dialog', {
      name: 'Cancel the booking of Cibulka Ota on BOZP – základní školení?',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    expect(removeAssignmentAction).toHaveBeenCalledWith({
      sessionExternalId: 'T019',
      employeeExternalId: 'E0003',
    })
  })

  it('moves seats out of an overbooked session and reports the outcome', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'overbooked', canApply: true })
    await user.click(screen.getByRole('button', { name: 'Move 1 seat' }))
    expect(moveSeatsAction).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('1 seat moved.')).toBeTruthy()

    moveSeatsAction.mockResolvedValueOnce({ ok: false })
    await user.click(screen.getByRole('button', { name: 'Move 1 seat' }))
    expect(
      await screen.findByText(
        '0 seats moved; 1 could not be moved (the sessions changed meanwhile).'
      )
    ).toBeTruthy()

    moveSeatsAction.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'Move 1 seat' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saving failed. Nothing was changed; try again.'
    )
  })

  it('saves every proposal at once and names each refusal', async () => {
    const user = userEvent.setup()
    applyAssignmentsAction.mockResolvedValueOnce({
      applied: 0,
      failed: [{ sessionExternalId: 'T018', employeeExternalId: 'E0001', reason: 'SESSION_FULL' }],
    })
    renderWorkbench({ view: 'action', canApply: true })
    await user.click(screen.getByRole('button', { name: /^Save 1 proposed booking/ }))
    expect(await screen.findByText('No booking saved; 1 refused:')).toBeTruthy()
    expect(
      screen.getByText('Adámek Petr on BOZP – základní školení (Nov 20, 2026): the session is full')
    ).toBeTruthy()

    applyAssignmentsAction.mockRejectedValueOnce(new Error('offline'))
    // The outcome can show before the save stops pending; until then the button is disabled
    // and a click would do nothing.
    const save = screen.getByRole('button', { name: /^Save 1 proposed booking/ })
    await waitFor(() => {
      expect(save).toHaveProperty('disabled', false)
    })
    await user.click(save)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saving failed. Nothing was changed; try again.'
    )
  })

  it('sorts the action list by any column', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'action' })
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(r => within(r).getAllByRole('link')[0]?.textContent)
    expect(names()).toEqual(['Adámek Petr', 'Bílá Jana'])
    for (const header of ['Person', 'Training', 'Lapses', 'Proposed session', 'Order']) {
      await user.click(screen.getByRole('button', { name: header }))
    }
    await user.click(screen.getByRole('button', { name: 'Person' }))
    await user.click(screen.getByRole('button', { name: 'Person' }))
    expect(names()).toEqual(['Bílá Jana', 'Adámek Petr'])
  })

  it('says when there is nothing in a view', () => {
    const empty = planAssignments({ asOf: INPUT.asOf, needs: [], sessions: [] })
    renderWorkbench({ plan: empty, view: 'action' })
    expect(screen.getByText('Every training in scope has a booking.')).toBeTruthy()
    renderWorkbench({ plan: empty, view: 'planned' })
    expect(screen.getByText('Nothing is booked yet.')).toBeTruthy()
    renderWorkbench({ plan: empty, view: 'overbooked' })
    expect(screen.getByText('No session is overbooked.')).toBeTruthy()
    renderWorkbench({ plan: empty, view: 'breakdown', bucket: '2026-11' })
    expect(screen.getByText('Nothing lapses in this month.')).toBeTruthy()
    // With nothing lapsing, the forecast card points at "now".
    const forecast = screen.getAllByRole('link', { name: /^Lapsing in the next/ })
    expect(new Set(forecast.map(a => a.getAttribute('href')))).toEqual(new Set(['/advisor']))
  })

  it('shows the window of a training never held, booked or not', () => {
    const plan = planAssignments({
      ...INPUT,
      needs: [
        need('E0002', 'Bílá Jana', 'MISSING', null),
        need('E0004', 'Dvořák Jan', 'MISSING', null),
      ],
      sessions: [
        session('T018', '2026-11-20', { capacity: 2, assigned: ['E0004'] }),
        session('T022', '2026-11-25', { capacity: 0, courseCode: 'X' }),
      ],
    })
    renderWorkbench({ plan })
    expect(within(rowOf('Bílá Jana')).getByText('Never held')).toBeTruthy()
    expect(within(rowOf('Dvořák Jan')).getByText('Never held, until Nov 20, 2026')).toBeTruthy()
  })

  it('offers what to do when no session can take a training', () => {
    const plan = planAssignments({
      ...INPUT,
      needs: [
        {
          ...need('E0005', 'Eliáš Karel', 'EXPIRED', '2026-08-01'),
          course: { code: 'ANGL', name: 'Anglický jazyk – kurz' },
        },
      ],
      sessions: [],
    })
    renderWorkbench({ plan, view: 'action' })
    const row = rowOf('Eliáš Karel')
    expect(within(row).getByText('No session scheduled')).toBeTruthy()
    expect(hrefOf('Schedule a session', row)).toBe('/courses/ANGL')
    expect(screen.getByRole('link', { name: /Anglický jazyk – kurz: 1 person/ })).toBeTruthy()
  })
})
