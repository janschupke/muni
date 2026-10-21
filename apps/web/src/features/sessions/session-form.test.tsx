import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type SessionDefaults, SessionForm } from '@/features/sessions/session-form'
import { checkSessionSlotAction } from '@/server/actions/sessions'
import { EXTERNAL, INTERNAL } from '@/test/fixtures'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))
// The pause before asking about the room is useSettled's own (use-settled.test.ts): here a
// slot is asked about at once, so what is asked does not depend on how fast the test runs.
vi.mock('@/lib/use-settled', () => ({ useSettled: <T,>(value: T) => value }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

const ROOMS = {
  aula: {
    id: 'room_aula_a',
    name: 'Aula A',
    kind: 'CLASSROOM' as const,
    capacity: 30,
    capabilities: ['PROJECTOR' as const],
  },
  small: {
    id: 'room_small',
    name: 'Malá',
    kind: 'CLASSROOM' as const,
    capacity: 12,
    capabilities: ['PROJECTOR' as const],
  },
  lab: { id: 'room_lab', name: 'Lab', kind: 'LAB' as const, capacity: 40, capabilities: [] },
  online: {
    id: 'room_online',
    name: 'Online',
    kind: 'ONLINE' as const,
    capacity: null,
    capabilities: [],
  },
}

const COURSES = {
  bozp: {
    id: 'course_bozp',
    code: 'BOZP-Z',
    name: 'BOZP – základní školení',
    validityMonths: 24,
    needs: { sessionMinutes: 180, seats: 20, onlineAllowed: true, capabilities: [] },
    offerings: [INTERNAL, EXTERNAL],
  },
  fire: {
    id: 'course_poz',
    code: 'POZ-OCH',
    name: 'Požární ochrana',
    validityMonths: 24,
    needs: {
      sessionMinutes: 120,
      seats: null,
      onlineAllowed: false,
      capabilities: ['PROJECTOR' as const],
    },
    offerings: [INTERNAL],
  },
}

/** Opens a select by its label and picks an option. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

function defaultsOf(roomId: string): SessionDefaults {
  return {
    courseId: 'course_bozp',
    providerId: INTERNAL.providerId,
    date: '2027-03-01',
    startTime: '09:00',
    endTime: '12:00',
    roomId,
    capacity: 10,
    unnamedBookings: 0,
    pricePerPerson: null,
    status: 'PLANNED',
  }
}

describe('the session form checks itself as the user types', () => {
  const renderForm = (over: Partial<Parameters<typeof SessionForm>[0]> = {}) =>
    renderClient(
      <SessionForm
        isNew
        action={vi.fn()}
        cancelHref="/sessions"
        heading={{ title: 'New session' }}
        rooms={[ROOMS.aula, ROOMS.small, ROOMS.lab, ROOMS.online]}
        courses={[COURSES.bozp, COURSES.fire]}
        defaults={{
          courseId: 'course_bozp',
          providerId: INTERNAL.providerId,
          date: '2027-03-01',
          startTime: '09:00',
          endTime: '12:00',
          roomId: '',
          capacity: 20,
          unnamedBookings: 0,
          pricePerPerson: null,
          status: 'PLANNED',
        }}
        {...over}
      />
    )
  const capacity = () => screen.getByRole('textbox', { name: /^Seats/ })

  it('never changes the seats for a room: a room too small marks both fields', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm()
    const room = () => screen.getByRole('combobox', { name: /Room/ })
    // A room's option says what it holds; the seats stay as the course set them.
    await choose(user, /Room/, /Aula A · 30 seats/)
    expect(capacity()).toHaveProperty('value', '20')
    expect(screen.getByText('The course opens 20 seats. The room holds 30 seats.')).toBeTruthy()
    await choose(user, /Room/, /Malá · 12 seats/)
    expect(capacity()).toHaveProperty('value', '20')
    // Either a bigger room or fewer seats settles it: both say so.
    expect(screen.getAllByText('Malá holds 12; this session opens 20.')).toHaveLength(2)
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
    expect(room().getAttribute('aria-invalid')).toBe('true')
    await user.click(room())
    expect(screen.getByRole('option', { name: /Malá · 12 seats · too small/ })).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.clear(capacity())
    await user.type(capacity(), '12')
    expect(screen.queryByText(/this session opens/)).toBeNull()
    expect(room().getAttribute('aria-invalid')).toBeNull()
    // Typed seats stay through a change of room, too.
    await choose(user, /Room/, /Aula A/)
    expect(capacity()).toHaveProperty('value', '12')
  })

  it('does not send a form with a conflict: the first field at odds gets the focus', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const action = vi.fn()
    const user = userEvent.setup()
    renderForm({ action, defaults: { ...defaultsOf('room_small'), capacity: 20 } })
    await user.click(screen.getByRole('button', { name: 'Schedule session' }))
    expect(action).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: /Room/ }))
  })

  it('checks the room against the course, the end against the start, and asks if the room is free', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    const user = userEvent.setup()
    renderForm({ defaults: { ...defaultsOf('room_lab'), courseId: 'course_poz' } })
    // Another room or another course settles it: both fields say so.
    expect(screen.getAllByText('Lab lacks: Projector.')).toHaveLength(2)
    expect(screen.getByRole('combobox', { name: /Course/ }).getAttribute('aria-invalid')).toBe(
      'true'
    )
    await choose(user, /Room/, /Online/)
    expect(screen.getAllByText('This course is not held online.')).toHaveLength(2)
    await choose(user, /Course/, /BOZP-Z/)
    expect(screen.queryByText('This course is not held online.')).toBeNull()
    // An online room is never asked about; a real one is.
    const askedRooms = () =>
      vi.mocked(checkSessionSlotAction).mock.calls.map(([slot]) => slot.roomId)
    expect(askedRooms()).not.toContain('room_online')
    await choose(user, /Room/, /Aula A/)
    expect(
      await screen.findByText('Another planned session uses this room at that time.')
    ).toBeTruthy()
    expect(askedRooms()).not.toContain('room_online')
    expect(checkSessionSlotAction).toHaveBeenLastCalledWith(
      { roomId: 'room_aula_a', date: '2027-03-01', startTime: '09:00', endTime: '12:00' },
      null
    )
    // The end is the course's length after the start, shown, not typed.
    const end = screen.getByRole('status', { name: /^End/ })
    expect(end.textContent).toBe('12:00')
    const start = screen.getByRole('textbox', { name: /^Start/ })
    await user.clear(start)
    await user.type(start, '1030')
    await user.tab()
    expect(end.textContent).toBe('13:30')
  })

  it('offers only the providers of the course, with their prices, and marks one that does not offer it', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm({ defaults: { ...defaultsOf('room_aula_a'), providerId: EXTERNAL.providerId } })
    const spaced = (text: string | null) => text?.replace(/\s/g, ' ')
    expect(spaced(screen.getByRole('status', { name: 'Price per person' }).textContent)).toBe(
      '600,00 Kč'
    )
    await user.click(screen.getByRole('combobox', { name: /Provider/ }))
    expect(screen.getAllByRole('option').map(o => spaced(o.textContent))).toEqual([
      'Interní školitel · 450,00 Kč · default',
      'Externí lektor · 600,00 Kč',
    ])
    await user.keyboard('{Escape}')
    // POZ-OCH is offered by the internal one only: the external one is marked on both fields.
    await choose(user, /Course/, /POZ-OCH/)
    expect(
      screen.getAllByText(
        'That provider does not offer the course. Choose one that does, or add the course to its offerings.'
      )
    ).toHaveLength(2)
    await choose(user, /Provider/, /Interní/)
    expect(screen.queryByText(/does not offer the course/)).toBeNull()
    // A course with no length: nothing to end by.
    renderForm({
      courses: [{ ...COURSES.bozp, needs: { ...COURSES.bozp.needs, sessionMinutes: null } }],
    })
    expect(screen.getAllByRole('status', { name: /^End/ }).at(-1)?.textContent).toBe(
      'The course has no length set yet.'
    )
  })

  it('keeps the seats at or above the bookings when editing', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm({
      isNew: false,
      self: 'T016',
      named: 3,
      defaults: { ...defaultsOf('room_aula_a'), capacity: 10, unnamedBookings: 5 },
    })
    expect(screen.getByText(/8 seats are booked\./)).toBeTruthy()
    await user.clear(capacity())
    await user.type(capacity(), '6')
    expect(
      await screen.findAllByText('8 seats are booked; the session cannot open fewer.')
    ).toHaveLength(2)
    const unnamed = screen.getByRole('textbox', { name: /Other bookings/ })
    await user.clear(capacity())
    await user.type(capacity(), '10')
    await user.clear(unnamed)
    await user.type(unnamed, '9')
    // More seats or fewer unnamed bookings settle it: both say so (12 booked, 10 seats).
    expect(unnamed.getAttribute('aria-invalid')).toBe('true')
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByText('12 seats are booked; the session cannot open fewer.')).toHaveLength(
      2
    )
    // Only named bookings left: the unnamed field has nothing to give.
    await user.clear(unnamed)
    await user.type(unnamed, '0')
    await user.clear(capacity())
    await user.type(capacity(), '2')
    expect(unnamed.getAttribute('aria-invalid')).toBeNull()
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
  })
})
