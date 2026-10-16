import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Dialog } from './dialog'

function Harness({
  description,
  returnFocus = true,
}: {
  description?: string
  returnFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        Laboratoře · BOZP
      </button>
      <button type="button">Jinde</button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Laboratoře · BOZP – základní školení"
        description={description}
        closeLabel="Zavřít"
        returnFocusTo={returnFocus ? () => opener.current : undefined}
      >
        <a href="/employees/E0153">Černá Marie</a>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('opens as a labelled modal and returns focus to the control that opened it', async () => {
    const user = userEvent.setup()
    render(<Harness description="12 z 20 platí" />)
    await user.click(screen.getByRole('button', { name: 'Laboratoře · BOZP' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Laboratoře · BOZP – základní školení',
    })
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText('12 z 20 platí')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Černá Marie' })).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Laboratoře · BOZP' }))
  })

  it('closes from its close button, without a description or a focus target', async () => {
    const user = userEvent.setup()
    render(<Harness returnFocus={false} />)
    await user.click(screen.getByRole('button', { name: 'Laboratoře · BOZP' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.hasAttribute('aria-describedby')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Zavřít' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
