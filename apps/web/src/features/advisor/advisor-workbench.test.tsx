// @vitest-environment jsdom
import {
  DEFAULT_ADVISOR_SETTINGS,
  type AdvisorInput,
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
  // jsdom lacks what Radix Slider and Select reach for.
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

const INPUT: AdvisorInput = {
  asOf: '2026-10-16',
  expiringWithinDays: 30,
  needs: [
    {
      employee: {
        externalId: 'E0001',
        name: 'Adámek Petr',
        department: 'Laboratoře',
        status: 'ACTIVE',
      },
      course: { code: 'BOZP-Z', name: 'BOZP – základní školení' },
      status: 'EXPIRED',
      validUntil: '2026-09-01',
    },
    {
      employee: {
        externalId: 'E0002',
        name: 'Bílá Jana',
        department: 'Knihovna',
        status: 'ACTIVE',
      },
      course: { code: 'BOZP-Z', name: 'BOZP – základní školení' },
      status: 'MISSING',
      validUntil: null,
    },
  ],
  sessions: [
    session('T016', '2026-11-04', { capacity: 2, unnamedBookings: 3 }),
    session('T018', '2026-11-20', { capacity: 2 }),
  ],
  activeCounts: { VALID: 8, EXPIRING: 0, EXPIRED: 1, MISSING: 1, total: 10 },
}

function renderWorkbench(canApply: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Prague">
      <TooltipProvider>
        <AdvisorWorkbench
          input={INPUT}
          initialSettings={DEFAULT_ADVISOR_SETTINGS}
          canApply={canApply}
        />
      </TooltipProvider>
    </NextIntlClientProvider>
  )
}

const planRows = () =>
  within(screen.getByRole('tabpanel'))
    .getAllByRole('row')
    .slice(1)
    .map(r => r.textContent)

describe('AdvisorWorkbench', () => {
  it('plans the most urgent person into the one free seat, and explains why', async () => {
    const user = userEvent.setup()
    renderWorkbench(false)
    // T016's excess seat moves to T018 first, leaving one seat there for the plan.
    expect(planRows()).toHaveLength(1)
    expect(planRows()[0]).toContain('Adámek Petr')
    await user.click(screen.getByRole('button', { name: 'Why: Adámek Petr' }))
    const terms = screen.getByRole('table', { name: 'Score, term by term' })
    expect(within(terms).getByText('Priority: expired')).toBeTruthy()
    expect(within(terms).getByText('+100')).toBeTruthy()
  })

  it('re-plans live when a weight moves, and keeps the settings in the URL', async () => {
    const user = userEvent.setup()
    renderWorkbench(false)
    const slider = screen.getByRole('slider', { name: 'Never completed' })
    slider.focus()
    await user.keyboard('{End}')
    expect(slider.getAttribute('aria-valuenow')).toBe('200')
    expect(planRows()[0]).toContain('Bílá Jana')
    expect(window.location.search).toBe('?weightMissing=200')

    await user.click(screen.getByRole('button', { name: 'Defaults' }))
    expect(planRows()[0]).toContain('Adámek Petr')
    expect(window.location.search).toBe('')
  })

  it('lets visitors explore but not save', () => {
    renderWorkbench(false)
    expect(screen.getByText(/Sign in to save bookings/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
  })

  it('saves a suggestion as an advisor booking with its score', async () => {
    const user = userEvent.setup()
    renderWorkbench(true)
    await user.click(
      screen.getByRole('button', { name: 'Save the booking of Adámek Petr on T018' })
    )
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      expect.objectContaining({
        sessionExternalId: 'T018',
        employeeExternalId: 'E0001',
        source: 'ADVISOR',
        score: expect.any(Number) as number,
      }),
    ])
    expect(await screen.findByText('1 booking saved.')).toBeTruthy()
  })

  it('shows overbooked sessions and what is left over', async () => {
    const user = userEvent.setup()
    renderWorkbench(true)
    await user.click(screen.getByRole('tab', { name: /Overbooked/ }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('3 of 2 · 1 over')).toBeTruthy()
    expect(within(panel).getByText(/Move 1 seat to T018/)).toBeTruthy()
  })
})
