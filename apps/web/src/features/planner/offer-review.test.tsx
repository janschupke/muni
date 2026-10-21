// @vitest-environment jsdom
import type { SessionOffer } from '@muni/domain/planner'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkSessionSlotAction, createPlannedSessionAction } from '@/server/actions/sessions'
import { AULA_A, EXTERNAL, INTERNAL, ONLINE } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { OfferReview } from './offer-review'
import { OfferSummary } from './offer-summary'
import { useOfferDraft } from './use-offer-draft'

// The pause before asking about the room is useSettled's own (use-settled.test.ts): here a
// slot is asked about at once.
vi.mock('@/lib/use-settled', () => ({ useSettled: <T,>(value: T) => value }))
vi.mock('@/server/actions/sessions', () => ({
  createPlannedSessionAction: vi.fn(),
  checkSessionSlotAction: vi.fn(() => Promise.resolve(null)),
}))

afterEach(() => {
  vi.clearAllMocks()
})

/** Clicks a button the last answer made ready: it is enabled the moment the answer shows. */
async function clickReady(user: ReturnType<typeof userEvent.setup>, button: HTMLElement) {
  expect(button).toHaveProperty('disabled', false)
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

const CHECKED = {
  ok: true as const,
  externalId: 'S007',
  courseCode: 'POZ-OCH',
  booked: 2,
  dryRun: true,
}

const OFFER: SessionOffer = {
  id: 'POZ-OCH|now|1',
  course: {
    id: 'course_poz',
    code: 'POZ-OCH',
    name: 'Požární ochrana',
    sessionMinutes: 120,
    seats: 40,
    onlineAllowed: false,
    capabilities: ['PROJECTOR'],
    offerings: [INTERNAL, EXTERNAL],
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
  offering: INTERNAL,
  late: false,
  problem: null,
}

function renderReview(offer: SessionOffer = OFFER) {
  const onOpenChange = vi.fn()
  renderClient(<OfferReview open offer={offer} rooms={ROOMS} onOpenChange={onOpenChange} />)
  return {
    dialog: screen.getByRole('dialog', { name: `New session: ${offer.course.name}` }),
    onOpenChange,
  }
}

describe('OfferReview', () => {
  it('checks what is typed as it is typed, and will not check what cannot be saved', async () => {
    const user = userEvent.setup()
    const { dialog } = renderReview()
    const check = within(dialog).getByRole('button', { name: 'Check' })
    const capacity = within(dialog).getByRole('textbox', { name: /^Seats/ })
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
    // Another provider of the course, at its own price.
    await user.click(within(dialog).getByRole('combobox', { name: /Provider/ }))
    await user.click(screen.getByRole('option', { name: /Externí lektor/ }))
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
    const capacity = within(dialog).getByRole('textbox', { name: /^Seats/ })
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
    await user.type(date, '31.10.2026')
    await user.tab()
    expect(within(dialog).getByText('31.10.2026 is a weekend or public holiday.')).toBeTruthy()
    expect(within(dialog).getByText('This is after the due date, 30.10.2026.')).toBeTruthy()

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
    await clickReady(user, within(dialog).getByRole('button', { name: 'Check' }))
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

  it('stays open while a check is out, and closes from the review when kept as is', async () => {
    const user = userEvent.setup()
    let answer: (outcome: typeof CHECKED) => void = () => undefined
    vi.mocked(createPlannedSessionAction).mockReturnValueOnce(
      new Promise(resolve => {
        answer = resolve
      })
    )
    const { dialog, onOpenChange } = renderReview()
    await user.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(await within(dialog).findByRole('button', { name: 'Checking…' })).toHaveProperty(
      'disabled',
      true
    )
    // Escape does not close the dialog while the server is checking.
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    answer(CHECKED)
    expect(await within(dialog).findByText('What will be created')).toBeTruthy()
    await clickReady(user, within(dialog).getByRole('button', { name: 'Keep as is' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape when nothing is being sent', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderReview()
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('reviews a session for nobody, with the warnings the date carries', async () => {
    const user = userEvent.setup()
    vi.mocked(createPlannedSessionAction).mockResolvedValue({ ...CHECKED, booked: 0 })
    const { dialog } = renderReview()
    const date = within(dialog).getByRole('textbox', { name: /Date/ })
    await user.clear(date)
    await user.type(date, '31.10.2026')
    await user.tab()
    await user.click(within(dialog).getByRole('checkbox', { name: /Adámek Petr/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Bílá Jana/ }))
    expect(within(dialog).getByText(/Nobody ticked/)).toBeTruthy()
    // Ticked again, then off again: the box follows each click.
    await user.click(within(dialog).getByRole('checkbox', { name: /Bílá Jana/ }))
    expect(within(dialog).getByText(/^1 person ticked/)).toBeTruthy()
    await user.click(within(dialog).getByRole('checkbox', { name: /Bílá Jana/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(await within(dialog).findByText('What will be created')).toBeTruthy()
    expect(within(dialog).getByText('Nobody: the session is created empty.')).toBeTruthy()
    expect(within(dialog).getByText('31.10.2026 is a weekend or public holiday.')).toBeTruthy()
    expect(within(dialog).getByText('This is after the due date, 30.10.2026.')).toBeTruthy()
    expect(createPlannedSessionAction).toHaveBeenCalledWith({
      session: {
        courseId: 'course_poz',
        providerId: 'prv_internal',
        date: '2026-10-31',
        startTime: '10:00',
        roomId: 'room_aula_a',
        capacity: 2,
      },
      people: [],
      dryRun: true,
    })
    await user.click(within(dialog).getByRole('button', { name: 'Create session and book nobody' }))
    expect(createPlannedSessionAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ people: [], dryRun: false })
    )
  })

  it('asks for a provider, a day and a length the offer does not have', () => {
    const { dialog } = renderReview({
      ...OFFER,
      course: { ...OFFER.course, sessionMinutes: null },
      slot: null,
      room: null,
      offering: null,
      capacity: null,
    })
    expect(within(dialog).getByText('This field is required.')).toBeTruthy()
    expect(
      within(dialog).getByText('The course has no length set: set it on the course first.')
    ).toBeTruthy()
    // The size of the group fills the seats when the offer names no capacity.
    expect(within(dialog).getByRole('textbox', { name: /^Seats/ })).toHaveProperty('value', '2')
    expect(within(dialog).getByRole('button', { name: 'Check' })).toHaveProperty('disabled', true)
  })

  it('says when the provider it names no longer offers the course', () => {
    const { dialog } = renderReview({
      ...OFFER,
      offering: { ...EXTERNAL, providerId: 'prv_gone', providerName: 'Bývalý lektor' },
    })
    expect(
      within(dialog).getByText(
        'That provider does not offer the course. Choose one that does, or add the course to its offerings.'
      )
    ).toBeTruthy()
  })

  it('says when the room is taken then', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    const { dialog } = renderReview()
    expect(
      await within(dialog).findByText('Another planned session uses this room at that time.')
    ).toBeTruthy()
  })
})

describe('OfferSummary', () => {
  function Summary({ offer }: { offer: SessionOffer }) {
    const draft = useOfferDraft(offer, ROOMS, () => undefined)
    return <OfferSummary offer={offer} draft={draft} />
  }

  /** The value a description list gives for a term. */
  const valueOf = (term: string) => screen.getByText(term).nextElementSibling?.textContent

  it('lists who is booked and what it costs', () => {
    renderClient(<Summary offer={OFFER} />)
    expect(valueOf('Room')).toBe('Aula A')
    expect(valueOf('Capacity')).toBe('2')
    expect(valueOf('Booked')).toBe('Adámek PetrBílá Jana')
    expect(valueOf('Cost of these bookings')).toMatch(/^900,00\sKč$/)
  })

  it('shows a dash for what the offer does not name', () => {
    renderClient(<Summary offer={{ ...OFFER, slot: null, room: null, offering: null }} />)
    expect(valueOf('When')).toBe('—')
    expect(valueOf('Room')).toBe('—')
    expect(valueOf('Price per person')).toBe('—')
    expect(valueOf('Cost of these bookings')).toBe('—')
  })
})
