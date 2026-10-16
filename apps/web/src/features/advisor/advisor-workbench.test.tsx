// @vitest-environment jsdom
import {
  planAssignments,
  type AdvisorInput,
  type AdvisorNeed,
  type AdvisorSession,
} from '@muni/domain/advisor'
import { TooltipProvider } from '@muni/ui/tooltip'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/messages/en.json'

import { AdvisorWorkbench } from './advisor-workbench'

const applyAssignmentsAction = vi.fn((pairs: unknown[]) =>
  Promise.resolve({ applied: pairs.length, failed: [] })
)
const moveSeatsAction = vi.fn(() => Promise.resolve({ ok: true as const }))
vi.mock('@/server/actions/assignments', () => ({
  applyAssignmentsAction: (pairs: unknown[]) => applyAssignmentsAction(pairs),
  moveSeatsAction: () => moveSeatsAction(),
}))

beforeAll(() => {
  // jsdom lacks what Radix (popper, scrolling) reaches for.
  globalThis.ResizeObserver = class {
    observe() {
      return undefined
    }
    unobserve() {
      return undefined
    }
    disconnect() {
      return undefined
    }
  }
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})

afterEach(() => {
  cleanup()
  applyAssignmentsAction.mockClear()
  moveSeatsAction.mockClear()
})

const session = (
  id: string,
  date: string,
  extra: Partial<AdvisorSession> = {}
): AdvisorSession => ({
  externalId: id,
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  location: 'Aula A',
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
}: {
  view?: 'breakdown' | 'action' | 'planned' | 'overbooked'
  bucket?: string
  canApply?: boolean
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Prague">
      <TooltipProvider>
        <AdvisorWorkbench
          plan={PLAN}
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
    expect(hrefOf('Aula A', adamek)).toBe('/sessions?location=Aula%20A')
    expect(within(adamek).getByText('Without it until Nov 20, 2026')).toBeTruthy()

    const bila = rowOf('Bílá Jana')
    expect(within(bila).getByText('Every session is full')).toBeTruthy()
    expect(hrefOf('Schedule a session', bila)).toBe('/courses/BOZP-Z')
  })

  it('lets visitors look but not save', () => {
    renderWorkbench({ view: 'action' })
    expect(screen.getByText('Sign in to save bookings.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Save|^Book/ })).toBeNull()
  })

  it('saves a proposal as an advisor booking', async () => {
    const user = userEvent.setup()
    renderWorkbench({ view: 'action', canApply: true })
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
})
