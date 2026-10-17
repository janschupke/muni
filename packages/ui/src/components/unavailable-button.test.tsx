// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { UnavailableButton } from './unavailable-button'

const REASON = 'No session of this course is scheduled'

describe('UnavailableButton', () => {
  it('stays where the action would be, dimmed, and says why on hover and on focus', async () => {
    const user = userEvent.setup()
    render(<UnavailableButton reason={REASON}>Book…</UnavailableButton>)
    const button = screen.getByRole('button', { name: 'Book…', description: REASON })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    // It takes the pointer (the kit's dimmed buttons do not), so hovering shows the reason.
    expect(button.className).toContain('aria-disabled:pointer-events-auto')
    await user.hover(button)
    expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toBe(REASON)
    await user.unhover(button)
    await user.tab()
    expect(document.activeElement).toBe(button)
    expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toBe(REASON)
  })

  it('does nothing when pressed, by pointer or key', async () => {
    const user = userEvent.setup()
    const submit = vi.fn((event: Event) => {
      event.preventDefault()
    })
    render(
      <form
        onSubmit={e => {
          submit(e.nativeEvent)
        }}
      >
        <UnavailableButton reason={REASON}>Book…</UnavailableButton>
      </form>
    )
    const button = screen.getByRole('button', { name: 'Book…' })
    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}{ }')
    fireEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
    expect(button.getAttribute('type')).toBe('button')
  })
})
