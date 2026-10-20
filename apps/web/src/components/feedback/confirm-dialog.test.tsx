import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { ConfirmDialog, type ConfirmOutcome } from './confirm-dialog'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => Promise<ConfirmOutcome> }) {
    const [open, setOpen] = useState(true)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel the booking?"
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="danger"
        onConfirm={onConfirm}
      >
        <p>The seat goes back to the session.</p>
      </ConfirmDialog>
    )
  }

  it('does it on confirm, then closes and says so', async () => {
    const user = userEvent.setup()
    renderClient(
      <Harness onConfirm={() => Promise.resolve({ kind: 'done', toast: { title: 'Cancelled' } })} />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(await screen.findByText('Cancelled')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open to say why it was refused, or why it failed', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<ConfirmOutcome>>()
      .mockResolvedValueOnce({ kind: 'refused', message: 'Already cancelled.' })
      .mockRejectedValueOnce(new Error('offline'))
    renderClient(<Harness onConfirm={onConfirm} />)
    const dialog = screen.getByRole('dialog', { name: 'Cancel the booking?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))
    expect(await within(dialog).findByText('Already cancelled.')).toBeTruthy()
    // The button reads "Working…" until the action has settled, which can be after the message.
    await user.click(await within(dialog).findByRole('button', { name: 'Cancel booking' }))
    expect(
      await within(dialog).findByText('That did not go through. Check the page and try again.')
    ).toBeTruthy()
    // Settled again (the confirm button has its name back): Keep is no longer disabled.
    await within(dialog).findByRole('button', { name: 'Cancel booking' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep booking' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('after a partial result, lists what was refused and offers only Close', async () => {
    const user = userEvent.setup()
    renderClient(
      <Harness
        onConfirm={() =>
          Promise.resolve({
            kind: 'partial',
            toast: { title: 'Booked 1 person' },
            message: 'Bílá Jana: the session is full',
          })
        }
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Bílá Jana: the session is full')).toBeTruthy()
    expect(screen.getByText('Booked 1 person')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Cancel booking' })).toBeNull()
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
