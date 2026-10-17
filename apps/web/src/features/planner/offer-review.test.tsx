// @vitest-environment jsdom
import type { SessionOffer } from '@muni/domain/planner'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkSessionSlotAction, createPlannedSessionAction } from '@/server/actions/sessions'
import { AULA_A, ONLINE } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { OfferReview } from './offer-review'

vi.mock('@/server/actions/sessions', () => ({
  createPlannedSessionAction: vi.fn(),
  checkSessionSlotAction: vi.fn(() => Promise.resolve(null)),
}))

afterEach(() => {
  vi.clearAllMocks()
})

/** Clicks a button once it is enabled: a request still settling keeps it disabled. */
async function clickWhenReady(user: ReturnType<typeof userEvent.setup>, button: HTMLElement) {
  await waitFor(() => {
    expect(button).toHaveProperty('disabled', false)
  })
  await user.click(button)
}

const ROOMS = [
  { ...AULA_A, capacity: 40, capabilities: ['PROJECTOR' as const] },
  { ...ONLINE, capacity: null, capabilities: [] },
  { id: 'room_small', name: 'Kabinet', kind: 'CLASSROOM' as const, capacity: 4, capabilities: [] },
  {
    id: 'room_tiny',
    name: 'Učebna 9',
    kind: 'CLASSROOM' as const,
    capacity: 1,
    capabilities: ['PROJECTOR' as const],
  },
]

const OFFER: SessionOffer = {
  id: 'POZ-OCH|now|1',
  course: {
    id: 'course_poz',
    code: 'POZ-OCH',
    name: 'Požární ochrana',
    sessionMinutes: 120,
    groupSize: 40,
    onlineAllowed: false,
    capabilities: ['PROJECTOR'],
  },
  bucket: 'now',
  deadline: '2026-10-30',
  size: 2,
  capacity: 2,
  people: [
    { externalId: 'E0002', name: 'Adámek Petr', department: 'Knihovna', lapses: null },
    { externalId: 'E0003', name: 'Bílá Jana', department: null, lapses: '2026-11-02' },
  ],
  slot: {
    date: '2026-10-19',
    startTime: '10:00',
    endTime: '12:00',
    startsAt: '2026-10-19T08:00:00.000Z',
    endsAt: '2026-10-19T10:00:00.000Z',
  },
  room: { id: AULA_A.id, name: AULA_A.name, kind: AULA_A.kind },
  alternatives: [],
  late: false,
  problem: null,
}

function renderReview() {
  const onOpenChange = vi.fn()
  renderClient(<OfferReview open offer={OFFER} rooms={ROOMS} onOpenChange={onOpenChange} />)
  return {
    dialog: screen.getByRole('dialog', { name: 'New session: Požární ochrana' }),
    onOpenChange,
  }
}

describe('OfferReview', () => {
  it('checks what is typed as it is typed, and will not check what cannot be saved', async () => {
    const user = userEvent.setup()
    const { dialog } = renderReview()
    const check = within(dialog).getByRole('button', { name: 'Check' })
    const capacity = within(dialog).getByRole('textbox', { name: /Capacity/ })
    await user.clear(capacity)
    await user.type(capacity, 'many')
    expect(within(dialog).getByText('Enter a number.')).toBeTruthy()
    expect(check).toHaveProperty('disabled', true)
    // Fewer seats than people ticked; unticking one fits again.
    await user.clear(capacity)
    await user.type(capacity, '1')
    expect(within(dialog).getByText('The capacity is below the 2 people ticked.')).toBeTruthy()
    await user.click(within(dialog).getByRole('checkbox', { name: /Bílá Jana/ }))
    expect(within(dialog).queryByText(/The capacity is below/)).toBeNull()
    expect(within(dialog).getByText(/1 person ticked/)).toBeTruthy()
    // A price that is not one.
    const price = within(dialog).getByRole('textbox', { name: /Price per person/ })
    await user.type(price, 'a lot')
    expect(check).toHaveProperty('disabled', true)
    await user.clear(price)
    await user.type(price, '450,50')
    expect(check).toHaveProperty('disabled', false)
    // A room that does not suit the course says why.
    await user.click(within(dialog).getByRole('combobox', { name: /Room/ }))
    await user.click(screen.getByRole('option', { name: /Kabinet/ }))
    // The same words as the session form's, for the same rule.
    expect(within(dialog).getByText(/^Kabinet lacks: /)).toBeTruthy()
    expect(check).toHaveProperty('disabled', true)
  })

  it('never changes the seats for a room: a room too small marks both fields', async () => {
    const user = userEvent.setup()
    const { dialog } = renderReview()
    const capacity = within(dialog).getByRole('textbox', { name: /Capacity/ })
    await user.click(within(dialog).getByRole('combobox', { name: /Room/ }))
    await user.click(screen.getByRole('option', { name: /Učebna 9/ }))
    expect(capacity).toHaveProperty('value', '2')
    expect(within(dialog).getAllByText('Učebna 9 holds 1; this session opens 2.')).toHaveLength(2)
    expect(capacity.getAttribute('aria-invalid')).toBe('true')
  })

  it('warns about a day off and a date after the due date, and says why the server refused', async () => {
    const user = userEvent.setup()
    const { dialog } = renderReview()
    const date = within(dialog).getByRole('textbox', { name: /Date/ })
    await user.clear(date)
    // 31 Oct 2026 is a Saturday, after the due date of 30 Oct.
    await user.type(date, '10/31/2026')
    await user.tab()
    expect(within(dialog).getByText('Oct 31, 2026 is a weekend or public holiday.')).toBeTruthy()
    expect(within(dialog).getByText('This is after the due date, Oct 30, 2026.')).toBeTruthy()

    vi.mocked(createPlannedSessionAction).mockResolvedValueOnce({
      ok: false,
      problem: 'ROOM_BUSY',
      refusals: [],
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(
      await within(dialog).findByText(
        'The room is taken at that time. Choose another time or room.'
      )
    ).toBeTruthy()
    // Offline: nothing written, and a reason to show.
    vi.mocked(createPlannedSessionAction).mockRejectedValueOnce(new Error('offline'))
    await clickWhenReady(user, within(dialog).getByRole('button', { name: 'Check' }))
    expect(
      await within(dialog).findByText('The session could not be created. Try again.')
    ).toBeTruthy()
  })

  it('goes back from the review to editing, and closes when kept as is', async () => {
    const user = userEvent.setup()
    vi.mocked(createPlannedSessionAction).mockResolvedValue({
      ok: true,
      externalId: 'S007',
      courseCode: 'POZ-OCH',
      booked: 2,
      dryRun: true,
    })
    const { dialog, onOpenChange } = renderReview()
    await user.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(await within(dialog).findByText('What will be created')).toBeTruthy()
    expect(within(dialog).getByText('Adámek Petr')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Back to editing' }))
    expect(within(dialog).getByRole('button', { name: 'Check' })).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Keep as is' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('says when the room is taken then', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    const { dialog } = renderReview()
    expect(
      await within(dialog).findByText(
        'Another planned session uses this room at that time.',
        {},
        { timeout: 2000 }
      )
    ).toBeTruthy()
  })
})
