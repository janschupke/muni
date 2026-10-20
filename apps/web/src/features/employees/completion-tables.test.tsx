import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompletionHistoryTable } from '@/features/employees/completion-tables'
import { SessionTable } from '@/features/sessions/session-table'
import { ONLINE, session } from '@/test/fixtures'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

/** Tables rendered on their own here sort and page their rows in the browser. */
const LOCAL = { local: 'the rows a test gives' }

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('tables', () => {
  it('sort a person’s history and show notes only when asked', async () => {
    const user = userEvent.setup()
    const completions = [
      {
        id: 'cmp_Z1',
        externalId: 'Z1',
        courseCode: 'GDPR',
        courseName: 'Ochrana osobních údajů',
        courseArchived: false,
        completedOn: '2025-11-05',
        validUntil: null,
        provider: null,
        price: 600,
        note: 'online',
      },
      {
        id: 'cmp_Z2',
        externalId: 'Z2',
        courseCode: 'BOZP-Z',
        courseName: 'BOZP – základní školení',
        courseArchived: false,
        completedOn: '2024-09-01',
        validUntil: '2026-09-01',
        provider: { id: 'prov_bezpecna', name: 'Bezpečná firma s.r.o.', archived: false },
        price: null,
      },
      {
        id: 'cmp_Z3',
        externalId: 'Z3',
        courseCode: 'STARY',
        courseName: 'Zrušený kurz',
        courseArchived: true,
        completedOn: '2023-01-01',
        validUntil: null,
        provider: { id: 'prov_old', name: 'Bývalý dodavatel', archived: true },
        price: null,
      },
    ]
    renderClient(<CompletionHistoryTable completions={completions} paging={LOCAL} showNotes />)
    expect(screen.getByText('online')).toBeTruthy()
    expect(screen.getAllByText('No expiry')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Bezpečná firma s.r.o.' }).getAttribute('href')).toBe(
      '/providers/prov_bezpecna'
    )
    // Archived course and provider: named, muted, not linked.
    expect(screen.getByText('Zrušený kurz').closest('a')).toBeNull()
    expect(screen.getByText('Bývalý dodavatel').closest('a')).toBeNull()
    expect(screen.getAllByText('(archived)', { exact: false })).toHaveLength(2)
    for (const header of ['Course', 'Completed', 'Valid until', 'Provider', 'Price'])
      await user.click(screen.getByRole('button', { name: header }))
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('sort sessions by date and place, and show only the essentials when compact', async () => {
    const user = userEvent.setup()
    renderClient(
      <SessionTable
        paging={LOCAL}
        sessions={[
          session(),
          session({ externalId: 'T020', room: ONLINE, capacity: 0, bookedCount: 0 }),
        ]}
        canEdit={false}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Date' }))
    await user.click(screen.getByRole('button', { name: 'Room' }))
    await user.click(screen.getByRole('button', { name: 'Booked' }))
    expect(screen.getAllByRole('row')).toHaveLength(3)

    renderClient(
      <SessionTable paging={LOCAL} sessions={[session({ status: 'CANCELLED' })]} canEdit compact />
    )
    const compact = screen.getAllByRole('table').at(-1) as HTMLElement
    expect(within(compact).queryByText('Aula A')).toBeNull()
    expect(within(compact).queryByRole('link', { name: /Edit session/ })).toBeNull()
  })
})
