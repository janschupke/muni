// @vitest-environment jsdom
import {
  type AdvisorInput,
  type AdvisorNeed,
  type AdvisorSession,
  planAssignments,
  tableItems,
} from '@muni/domain/advisor'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { renderClient } from '@/test/render'

import { AdvisorWorkbench } from './advisor-workbench'

const actions = vi.hoisted(() => ({
  applyAssignmentsAction: vi.fn(
    (pairs: unknown[]): Promise<{ ok: true; applied: number; failed: unknown[] } | object> =>
      Promise.resolve({ ok: true, applied: pairs.length, failed: [] as unknown[] })
  ),
  resolveOverbookingAction: vi.fn((): Promise<{ ok: true } | { ok: false; reason: string }> =>
    Promise.resolve({ ok: true })
  ),
  removeAssignmentAction: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/server/actions/assignments', () => actions)
const { applyAssignmentsAction, resolveOverbookingAction, removeAssignmentAction } = actions

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
  roomCapacity: 40,
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
  employee: {
    externalId,
    name,
    department: 'Laboratoře',
    departmentId: 'dep_lab',
    positionId: 'pos_lab',
    status: 'ACTIVE',
  },
  course: { code: 'BOZP-Z', name: 'BOZP – základní školení' },
  status,
  validUntil,
})

const INPUT: AdvisorInput = {
  asOf: '2026-10-16',
  now: '2026-10-15T22:00:00.000Z',
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

/** A sort header's click: the order the server is asked for. */
const sortAsked = vi.fn()

/** The workbench as the advisor read hands it over: the view's trainings, one page of them. */
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
  const table = tableItems(plan, view, bucket)
  return renderClient(
    <AdvisorWorkbench
      plan={{ ...plan, items: table.items }}
      asOf={INPUT.asOf}
      view={view}
      bucket={table.bucket}
      total={table.items.length}
      counts={table.counts}
      paging={{
        server: {
          page: 1,
          pageCount: 1,
          sorting: [],
          onSortingChange: sortAsked,
          hrefFor: page => `/advisor?page=${String(page)}`,
          linkAs: Link,
        },
      }}
      canApply={canApply}
    />
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
    // The current month holds only what lapses after today, and says so.
    expect(hrefOf(/^17.10.2026 – 31.10.2026/)).toBe('/advisor?bucket=2026-10')
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
    expect(within(adamek).getByText('From 02.09.2026')).toBeTruthy()
    // The proposed session's page offers Adámek for booking.
    expect(hrefOf(/20.11.2026/, adamek)).toBe('/sessions/T018?employee=E0001')
    expect(within(rowOf('Bílá Jana')).getByText('Every session is full')).toBeTruthy()
    // Visitors see what to do, not the buttons that do it.
    expect(screen.queryByRole('button', { name: /^Book/ })).toBeNull()
  })

  it('books the proposed session from a breakdown row, or schedules one when none can take it', async () => {
    const user = userEvent.setup()
    renderWorkbench({ canApply: true })
    const bila = rowOf('Bílá Jana')
    expect(
      within(bila)
        .getByRole('link', { name: 'Schedule a session of BOZP – základní školení for Bílá Jana' })
        .getAttribute('href')
    ).toBe('/courses/BOZP-Z/sessions/new')
    await user.click(
      within(rowOf('Adámek Petr')).getByRole('button', {
        name: 'Book BOZP – základní školení for Adámek Petr…',
      })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
    expect(applyAssignmentsAction).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ }))
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      { sessionExternalId: 'T018', employeeExternalId: 'E0001', source: 'ADVISOR' },
    ])
  })

  it('shows a booking after the lapse as planned with a gap, and the gap in days', () => {
    renderWorkbench({ bucket: '2026-12' })
    expect(screen.getByText(/lapses in December 2026/)).toBeTruthy()
    const row = rowOf('Cibulka Ota')
    expect(within(row).getByText('Planned, with a gap')).toBeTruthy()
    expect(within(row).getByText('01.12.2026 – 10.12.2026')).toBeTruthy()
    expect(within(row).getByText('9 days')).toBeTruthy()
  })

  it('lists what needs action with the proposed session, and links to everything named', () => {
    renderWorkbench({ view: 'action' })
    const adamek = rowOf('Adámek Petr')
    expect(hrefOf('Adámek Petr', adamek)).toBe('/employees/E0001')
    expect(hrefOf('BOZP – základní školení', adamek)).toBe('/courses/BOZP-Z')
    expect(hrefOf(/20.11.2026/, adamek)).toBe('/sessions/T018?employee=E0001')
    expect(hrefOf('Aula A', adamek)).toBe('/rooms/room_aula_a')
    expect(within(adamek).getByText('Without it until 20.11.2026')).toBeTruthy()

    const bila = rowOf('Bílá Jana')
    expect(within(bila).getByText('Every session is full')).toBeTruthy()
    expect(hrefOf('Schedule a session', bila)).toBe('/courses/BOZP-Z/sessions/new')
  })

  it('lets visitors look but not book', () => {
    renderWorkbench({ view: 'action' })
    expect(screen.getByText('Only admins can book people.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Book/ })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it.each(['action', 'breakdown'] as const)(
    'books from the %s tab on the session the admin chose in the dialog, after showing what it does',
    async view => {
      const user = userEvent.setup()
      const plan = planAssignments({
        ...INPUT,
        needs: [need('E0001', 'Adámek Petr', 'EXPIRED', '2026-09-01')],
        sessions: [
          session('T018', '2026-11-20', { capacity: 2 }),
          session('T021', '2026-12-01', { capacity: 5, pricePerPerson: 600 }),
        ],
      })
      renderWorkbench({ plan, view, canApply: true })
      await expectNoAxeViolations()
      await user.click(
        screen.getByRole('button', { name: 'Book BOZP – základní školení for Adámek Petr…' })
      )
      // The proposal, with the other session that could take them to choose instead.
      const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
      const choice = within(dialog).getByRole('combobox', { name: 'Session for Adámek Petr' })
      expect(choice.textContent).toMatch(/20.11.2026.*Aula A.*2 free/)
      expect(within(dialog).getByText(/^Total: 450,00\sKč$/)).toBeTruthy()
      await user.click(choice)
      await user.click(screen.getByRole('option', { name: /01.12.2026/ }))
      // Nothing is booked before the admin confirms what the dialog shows.
      expect(applyAssignmentsAction).not.toHaveBeenCalled()
      expect(within(dialog).getByText(/^Total: 600,00\sKč$/)).toBeTruthy()
      await user.click(
        within(dialog).getByRole('button', { name: /^Book 1 training · 600,00\sKč$/ })
      )
      expect(applyAssignmentsAction).toHaveBeenCalledWith([
        { sessionExternalId: 'T021', employeeExternalId: 'E0001', source: 'ADVISOR' },
      ])
      expect(await screen.findByText('Booked 1 training')).toBeTruthy()
    }
  )

  it('stops a booking that would overfill a session, until some are moved or left out', async () => {
    const user = userEvent.setup()
    const plan = planAssignments({
      ...INPUT,
      needs: [
        need('E0001', 'Adámek Petr', 'EXPIRED', '2026-09-01'),
        need('E0002', 'Bílá Jana', 'MISSING', null),
      ],
      sessions: [
        session('T018', '2026-11-20', { capacity: 1 }),
        session('T021', '2026-12-01', { capacity: 1 }),
      ],
    })
    renderWorkbench({ plan, view: 'action', canApply: true })
    await user.click(
      screen.getByRole('checkbox', { name: 'Select every proposed row on this page' })
    )
    await user.click(screen.getByRole('button', { name: 'Book 2 selected…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
    // The first moved onto the one-seat session the second is proposed.
    await user.click(within(dialog).getByRole('combobox', { name: 'Session for Adámek Petr' }))
    await user.click(screen.getByRole('option', { name: /01.12.2026/ }))
    expect(within(dialog).getByText(/2 chosen, 1 seat free/)).toBeTruthy()
    expect(
      within(dialog).getByRole('button', { name: /^Book 2 trainings · 900,00\sKč$/ })
    ).toHaveProperty('disabled', true)
    // Left out, the other no longer overfills it.
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Book Bílá Jana, BOZP – základní školení' })
    )
    expect(within(dialog).queryByText(/2 chosen/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ }))
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      { sessionExternalId: 'T021', employeeExternalId: 'E0001', source: 'ADVISOR' },
    ])
  })

  it('links every view and count to its own URL', () => {
    renderWorkbench()
    const tabs = screen.getByRole('navigation', { name: 'Advisor views' })
    expect(hrefOf(/^Action required/, tabs)).toBe('/advisor?view=action')
    expect(hrefOf(/^Remediation planned/, tabs)).toBe('/advisor?view=planned')
    // The forecast's card and its row in the breakdown open the same list.
    const forecast = screen.getAllByRole('link', { name: /^Lapsing by 31.03.2027/ })
    expect(forecast.map(a => a.getAttribute('href'))).toEqual([
      '/advisor?bucket=upcoming',
      '/advisor?bucket=upcoming',
    ])
  })

  it('lists everything the forecast card counts, in one table, a page in the address', () => {
    renderWorkbench({ bucket: 'upcoming' })
    const upcoming = PLAN.items.filter(i => i.bucket !== 'now').length
    expect(upcoming).toBe(PLAN.totals.upcoming)
    const card = screen.getAllByRole('link', { name: /^Lapsing by 31.03.2027/ })[0]
    expect(card?.textContent).toContain(String(upcoming))
    expect(
      screen.getByRole('table', {
        name: `Lapsing by 31.03.2027: ${String(upcoming)} ${upcoming === 1 ? 'training' : 'trainings'}`,
      })
    ).toBeTruthy()
    expect(screen.getByText(/lapses by 31.03.2027/)).toBeTruthy()
    // The selected row is the forecast's.
    expect(
      screen
        .getAllByRole('link', { name: /^Lapsing by 31.03.2027/ })
        .some(a => a.getAttribute('aria-current') === 'true')
    ).toBe(true)
  })

  it('shows overbooked sessions and where the advisor suggests their seats go', () => {
    renderWorkbench({ view: 'overbooked' })
    expect(screen.getByText('3 of 2 · 1 over')).toBeTruthy()
    // The suggestion on its own line, the session it names on the next: no link in a sentence.
    const move = screen.getByText(/Suggested: move 1 seat to/).parentElement ?? document.body
    expect(hrefOf(/20.11.2026/, move)).toBe('/sessions/T018')
    expect(screen.queryByRole('button', { name: /^Resolve/ })).toBeNull()
  })

  it('lists what is already booked, with the gap each booking leaves', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'planned' })
    const row = rowOf('Cibulka Ota')
    expect(hrefOf(/10.12.2026/, row)).toBe('/sessions/T019')
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
    await user.click(within(confirm).getByRole('button', { name: 'Cancel booking' }))
    expect(removeAssignmentAction).toHaveBeenCalledWith({
      sessionExternalId: 'T019',
      employeeExternalId: 'E0003',
    })
  })

  it('resolves overbooking the way the admin chooses: seats moved, or capacity raised', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'overbooked', canApply: true })
    await user.click(screen.getByRole('button', { name: /^Resolve the overbooking of/ }))
    const dialog = await screen.findByRole('dialog', { name: /^Resolve overbooking:/ })
    // What is wrong, what can move, and the suggestion filled in.
    expect(within(dialog).getByText(/3 booked for 2 seats, 1 over/)).toBeTruthy()
    const target = within(dialog).getByRole('textbox', { name: /20.11.2026/ })
    expect(target).toHaveProperty('value', '1')
    expect(within(dialog).getByText('After this: 2 booked for 2 seats.')).toBeTruthy()
    // More than the session can take is refused before anything is sent.
    await user.clear(target)
    await user.type(target, '5')
    // The error sits on the field it is about.
    expect(within(dialog).getByText('Only 2 seats are free there.')).toBeTruthy()
    expect(target.getAttribute('aria-invalid')).toBe('true')
    await user.clear(target)
    await user.type(target, 'two')
    expect(within(dialog).getByText('Enter a number.')).toBeTruthy()
    await user.clear(target)
    await user.type(target, '5')
    expect(within(dialog).getByRole('button', { name: 'Move 5 seats' })).toHaveProperty(
      'disabled',
      true
    )
    await user.clear(target)
    await user.type(target, '1')
    await user.click(within(dialog).getByRole('button', { name: 'Move 1 seat' }))
    expect(resolveOverbookingAction).toHaveBeenCalledWith({
      from: 'T016',
      resolution: { kind: 'move', moves: [{ to: 'T018', count: 1 }] },
    })
    expect(await screen.findByText(/^Moved 1 seat out of/)).toBeTruthy()

    // The other way: raise the capacity, which the 40-seat room allows.
    await user.click(screen.getByRole('button', { name: /^Resolve the overbooking of/ }))
    const again = await screen.findByRole('dialog', { name: /^Resolve overbooking:/ })
    await user.click(within(again).getByRole('radio', { name: /Raise the capacity/ }))
    expect(
      within(again).getByText(/Aula A has 40 seats: the capacity goes from 2 to 3/)
    ).toBeTruthy()
    resolveOverbookingAction.mockResolvedValueOnce({ ok: false, reason: 'ROOM_BUSY' })
    await user.click(within(again).getByRole('button', { name: 'Raise capacity to 3' }))
    expect(resolveOverbookingAction).toHaveBeenLastCalledWith({
      from: 'T016',
      resolution: { kind: 'raise', capacity: 3 },
    })
    // Refused: the dialog stays and says why.
    expect(await within(again).findByText('The room is taken then.')).toBeTruthy()
  })

  it('books every selected proposal and names each refusal', async () => {
    const user = userEvent.setup()
    applyAssignmentsAction.mockResolvedValueOnce({
      ok: true,
      applied: 0,
      failed: [{ sessionExternalId: 'T018', employeeExternalId: 'E0001', reason: 'SESSION_FULL' }],
    })
    renderWorkbench({ view: 'action', canApply: true })
    await user.click(screen.getByRole('checkbox', { name: /^Select Adámek Petr/ }))
    await user.click(screen.getByRole('button', { name: 'Book 1 selected…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
    await user.click(within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ }))
    expect(await within(dialog).findByText('Nobody was booked:')).toBeTruthy()
    expect(
      within(dialog).getByText(/^Adámek Petr on BOZP – základní školení, .*: the session is full$/)
    ).toBeTruthy()

    applyAssignmentsAction.mockRejectedValueOnce(new Error('offline'))
    const book = within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ })
    await waitFor(() => {
      expect(book).toHaveProperty('disabled', false)
    })
    await user.click(book)
    expect(
      await within(dialog).findByText('That did not go through. Check the page and try again.')
    ).toBeTruthy()
    // Turned away by the server (signed out meanwhile): nothing booked, and why.
    applyAssignmentsAction.mockResolvedValueOnce({ ok: false, problem: 'unauthorized' })
    await waitFor(() => {
      expect(book).toHaveProperty('disabled', false)
    })
    await user.click(book)
    expect(
      await within(dialog).findByText('your account may no longer make changes; sign in again')
    ).toBeTruthy()
  })

  it('books what it can and lists what was refused, then offers only Close', async () => {
    const user = userEvent.setup()
    const plan = planAssignments({
      ...INPUT,
      needs: [
        need('E0001', 'Adámek Petr', 'EXPIRED', '2026-09-01'),
        need('E0002', 'Bílá Jana', 'MISSING', null),
      ],
      sessions: [session('T018', '2026-11-20', { capacity: 5 })],
    })
    applyAssignmentsAction.mockResolvedValueOnce({
      ok: true,
      applied: 1,
      failed: [{ sessionExternalId: 'T018', employeeExternalId: 'E0002', reason: 'CONFLICT' }],
    })
    renderWorkbench({ plan, view: 'action', canApply: true })
    await user.click(
      screen.getByRole('checkbox', { name: 'Select every proposed row on this page' })
    )
    await user.click(screen.getByRole('button', { name: 'Book 2 selected…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
    const book = within(dialog).getByRole('button', { name: /^Book 2 trainings · 900,00\sKč$/ })
    await user.click(book)
    expect(await within(dialog).findByText(/^Booked 1; 1 was refused:/)).toBeTruthy()
    expect(within(dialog).getByText(/Bílá Jana on .*: clashes with another booking/)).toBeTruthy()
    expect(screen.getByText('Booked 1 training')).toBeTruthy()
    expect(book.isConnected).toBe(false)
  })

  it('leaves a training out of the booking and takes it back in', async () => {
    const user = userEvent.setup()
    const plan = planAssignments({
      ...INPUT,
      needs: [
        need('E0001', 'Adámek Petr', 'EXPIRED', '2026-09-01'),
        need('E0002', 'Bílá Jana', 'MISSING', null),
      ],
      sessions: [session('T018', '2026-11-20', { capacity: 5 })],
    })
    renderWorkbench({ plan, view: 'action', canApply: true })
    await user.click(
      screen.getByRole('checkbox', { name: 'Select every proposed row on this page' })
    )
    await user.click(screen.getByRole('button', { name: 'Book 2 selected…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
    const bila = within(dialog).getByRole('checkbox', {
      name: 'Book Bílá Jana, BOZP – základní školení',
    })
    await user.click(bila)
    expect(
      within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ })
    ).toBeTruthy()
    await user.click(bila)
    await user.click(
      within(dialog).getByRole('button', { name: /^Book 2 trainings · 900,00\sKč$/ })
    )
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      { sessionExternalId: 'T018', employeeExternalId: 'E0001', source: 'ADVISOR' },
      { sessionExternalId: 'T018', employeeExternalId: 'E0002', source: 'ADVISOR' },
    ])
  })

  it('asks the server for the order a header names, keeping the rows as they came', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'action' })
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(r => within(r).getAllByRole('link')[0]?.textContent)
    expect(names()).toEqual(['Adámek Petr', 'Bílá Jana'])
    for (const [header, id] of [
      ['Person', 'person'],
      ['Course', 'training'],
      ['Lapses', 'lapses'],
      ['Proposed session', 'proposal'],
      ['Order', 'rank'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: header }))
      expect(sortAsked).toHaveBeenLastCalledWith([{ id, desc: false }])
    }
    // The order is the server's to change: the rows stay until the next page arrives.
    expect(names()).toEqual(['Adámek Petr', 'Bílá Jana'])
  })

  it('says when there is nothing in a view', () => {
    const empty = planAssignments({ ...INPUT, needs: [], sessions: [] })
    renderWorkbench({ plan: empty, view: 'action' })
    expect(screen.getByText('Every training in scope has a booking.')).toBeTruthy()
    renderWorkbench({ plan: empty, view: 'planned' })
    expect(screen.getByText('Nothing is booked yet.')).toBeTruthy()
    renderWorkbench({ plan: empty, view: 'overbooked' })
    expect(screen.getByText('No session is overbooked.')).toBeTruthy()
    renderWorkbench({ plan: empty, view: 'breakdown', bucket: '2026-11' })
    expect(screen.getByText('Nothing lapses in this month.')).toBeTruthy()
    // With nothing lapsing, the forecast card still opens its own (empty) row.
    const forecast = screen.getAllByRole('link', { name: /^Lapsing by/ })
    expect(new Set(forecast.map(a => a.getAttribute('href')))).toEqual(
      new Set(['/advisor?bucket=upcoming'])
    )
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
    expect(within(rowOf('Dvořák Jan')).getByText('Never held, until 20.11.2026')).toBeTruthy()
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
    expect(hrefOf('Schedule a session', row)).toBe('/courses/ANGL/sessions/new')
    expect(screen.getByRole('link', { name: /Anglický jazyk – kurz: 1 person/ })).toBeTruthy()
  })
})
