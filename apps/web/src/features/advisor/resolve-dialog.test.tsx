// @vitest-environment jsdom
import type { AdvisorSession, OverbookedSession } from '@muni/domain/advisor'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { ResolveDialog } from './resolve-dialog'

const actions = vi.hoisted(() => ({
  resolveOverbookingAction: vi.fn((): Promise<{ ok: true } | { ok: false; reason: string }> =>
    Promise.resolve({ ok: true })
  ),
}))
vi.mock('@/server/actions/assignments', () => actions)
const { resolveOverbookingAction } = actions

afterEach(() => {
  vi.clearAllMocks()
})

const session = (extra: Partial<AdvisorSession> = {}): AdvisorSession => ({
  externalId: 'T016',
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  room: { id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM' },
  roomCapacity: 3,
  startsAt: '2026-11-04T07:00:00.000Z',
  endsAt: '2026-11-04T10:00:00.000Z',
  capacity: 2,
  unnamedBookings: 0,
  assigned: ['E0001', 'E0002', 'E0003'],
  pricePerPerson: 450,
  status: 'PLANNED',
  ...extra,
})

/** Three booked by name on two seats, nowhere to move them. */
const overbooked = (extra: Partial<OverbookedSession> = {}): OverbookedSession => ({
  session: session(),
  booked: 3,
  excess: 1,
  moves: [],
  remaining: 1,
  targets: [],
  raiseTo: 3,
  ...extra,
})

function renderDialog(o: OverbookedSession) {
  const onOpenChange = vi.fn()
  renderClient(<ResolveDialog overbooked={o} open onOpenChange={onOpenChange} />)
  return { onOpenChange, dialog: screen.getByRole('dialog', { name: /^Resolve overbooking:/ }) }
}

describe('ResolveDialog', () => {
  it('offers raising the capacity first when no seat can move, and raises it', async () => {
    const user = userEvent.setup()
    const { dialog, onOpenChange } = renderDialog(overbooked())
    expect(
      within(dialog).getByText('Every seat here is booked by name, so none can move.')
    ).toBeTruthy()
    expect(
      within(dialog)
        .getByRole('radio', { name: /Raise the capacity/ })
        .getAttribute('aria-checked')
    ).toBe('true')
    expect(
      within(dialog).getByText(/Aula A has 3 seats: the capacity goes from 2 to 3/)
    ).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Raise capacity to 3' }))
    expect(resolveOverbookingAction).toHaveBeenCalledWith({
      from: 'T016',
      resolution: { kind: 'raise', capacity: 3 },
    })
    expect(
      await screen.findByText(/^Capacity of BOZP – základní školení, .* raised to 3$/)
    ).toBeTruthy()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('raises an online session’s capacity without a room limit', () => {
    const { dialog } = renderDialog(
      overbooked({
        session: session({
          room: { id: 'room_online', name: 'Online', kind: 'ONLINE' },
          roomCapacity: null,
        }),
      })
    )
    expect(within(dialog).getByText(/Online is online: the capacity goes from 2 to 3/)).toBeTruthy()
  })

  it('says why the capacity cannot rise when the room is too small, and keeps the button off', async () => {
    const user = userEvent.setup()
    const { dialog } = renderDialog(overbooked({ raiseTo: null }))
    // Nothing can move either: the move panel is shown, with nowhere to send seats.
    expect(
      within(dialog)
        .getByRole('radio', { name: /Move seats/ })
        .getAttribute('aria-checked')
    ).toBe('true')
    await user.click(within(dialog).getByRole('radio', { name: /Raise the capacity/ }))
    expect(
      within(dialog).getByText(
        'Aula A has 3 seats, fewer than the 3 booked. Move seats instead, or edit the session to a larger room.'
      )
    ).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Raise the capacity' })).toHaveProperty(
      'disabled',
      true
    )
    expect(resolveOverbookingAction).not.toHaveBeenCalled()
  })

  it('counts an online room without seats as none when it cannot be raised', async () => {
    const user = userEvent.setup()
    const { dialog } = renderDialog(
      overbooked({
        raiseTo: null,
        session: session({
          room: { id: 'room_online', name: 'Online', kind: 'ONLINE' },
          roomCapacity: null,
        }),
      })
    )
    await user.click(within(dialog).getByRole('radio', { name: /Raise the capacity/ }))
    expect(within(dialog).getByText(/^Online has 0 seats, fewer than the 3 booked/)).toBeTruthy()
  })

  it('shows a refused move in the dialog', async () => {
    const user = userEvent.setup()
    const target = session({
      externalId: 'T018',
      startsAt: '2026-11-20T07:00:00.000Z',
      endsAt: '2026-11-20T10:00:00.000Z',
      assigned: [],
    })
    const { dialog } = renderDialog(
      overbooked({
        session: session({ unnamedBookings: 1, assigned: ['E0001', 'E0002'] }),
        targets: [{ session: target, free: 2 }],
        moves: [{ to: target, count: 1 }],
      })
    )
    resolveOverbookingAction.mockResolvedValueOnce({ ok: false, reason: 'TARGET_FULL' })
    await user.click(within(dialog).getByRole('button', { name: 'Move 1 seat' }))
    expect(await within(dialog).findByText('A chosen session filled up meanwhile.')).toBeTruthy()
  })
})
