import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { Dialog, Drawer } from './dialog'
import { IconButton } from './icon-button'

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

describe('Drawer', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Registr školení"
        closeLabel="Zavřít"
        trigger={<button type="button">Menu</button>}
      >
        <a href="/kurzy">Kurzy</a>
      </Drawer>
    )
  }

  it('slides the navigation in from its trigger and closes it again', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Registr školení' })
    expect(drawer.hasAttribute('aria-describedby')).toBe(false)
    expect(screen.getByRole('link', { name: 'Kurzy' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zavřít' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu' }))
  })
})

describe('IconButton', () => {
  it('is named by its label and shows it as a tooltip', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <IconButton label="Odebrat" onClick={onClick}>
        <svg aria-hidden />
      </IconButton>
    )
    const button = screen.getByRole('button', { name: 'Odebrat' })
    expect(button.hasAttribute('title')).toBe(false)
    await user.hover(button)
    expect((await screen.findByRole('tooltip')).textContent).toBe('Odebrat')
    await user.click(button)
    expect(onClick).toHaveBeenCalled()
  })
})
