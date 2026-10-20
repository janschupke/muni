import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RemoveBookingButton } from '@/features/bookings/remove-booking-button'
import { removeAssignmentAction } from '@/server/actions/assignments'
import { advisorInput } from '@/test/fixtures'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

vi.mock('@/server/actions/assignments', () => ({ removeAssignmentAction: vi.fn() }))

vi.mock('@/server/actions/archive', () => ({ unarchiveAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const [T016, T018] = advisorInput().sessions
if (!T016 || !T018) throw new Error('fixture')

describe('removing a booking', () => {
  const remove = async () => {
    const user = userEvent.setup()
    renderClient(
      <RemoveBookingButton
        sessionExternalId="T018"
        employeeExternalId="E0153"
        label="Remove Černá Marie"
        confirmTitle="Remove Černá Marie from this session?"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Remove Černá Marie' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Černá Marie from this session?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))
    return dialog
  }

  it('says the seat is back once removed', async () => {
    vi.mocked(removeAssignmentAction).mockResolvedValue({ ok: true })
    await remove()
    expect(await screen.findByText('Booking cancelled')).toBeTruthy()
    expect(removeAssignmentAction).toHaveBeenCalledWith({
      sessionExternalId: 'T018',
      employeeExternalId: 'E0153',
    })
  })

  it('says when it was gone already, and why the server refused otherwise', async () => {
    vi.mocked(removeAssignmentAction).mockResolvedValue({ ok: false, reason: 'gone' })
    const gone = await remove()
    expect(await within(gone).findByText('This booking was already cancelled.')).toBeTruthy()
  })

  it('says why the server turned it away', async () => {
    vi.mocked(removeAssignmentAction).mockResolvedValue({ ok: false, reason: 'unauthorized' })
    const dialog = await remove()
    expect(
      await within(dialog).findByText('your account may no longer make changes; sign in again')
    ).toBeTruthy()
  })
})
