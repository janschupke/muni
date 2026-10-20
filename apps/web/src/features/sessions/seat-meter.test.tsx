import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionTable } from '@/features/sessions/session-table'
import { session } from '@/test/fixtures'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

/** Tables rendered on their own here sort and page their rows in the browser. */
const LOCAL = { local: 'the rows a test gives' }

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('seat occupancy', () => {
  it.each([
    [24, 30, 'Almost full', 'text-warning-fg', 'bg-warning-fill'],
    [30, 30, 'Full', 'text-warning-fg', 'bg-warning-fill'],
    [31, 30, 'Overbooked', 'text-danger-fg', 'bg-danger-fill'],
  ])(
    '%i of %i is “%s” in its signal colour, badge and meter alike',
    (booked, capacity, label, ink, fill) => {
      renderClient(
        <SessionTable
          paging={LOCAL}
          sessions={[session({ bookedCount: booked, unnamedBookings: booked - 1, capacity })]}
          canEdit={false}
        />
      )
      expect(screen.getByText(label).className).toContain(ink)
      expect(screen.getByRole('meter').firstElementChild?.className).toContain(fill)
    }
  )

  it('stays brand blue and unlabelled while there is room', () => {
    renderClient(
      <SessionTable
        paging={LOCAL}
        sessions={[session({ bookedCount: 23, unnamedBookings: 22, capacity: 30 })]}
        canEdit={false}
      />
    )
    expect(screen.getByRole('meter').firstElementChild?.className).toContain('bg-accent')
    expect(screen.queryByText(/full|Overbooked/i)).toBeNull()
  })
})
