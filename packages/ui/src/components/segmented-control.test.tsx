import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '../test/render'
import { SegmentedControl } from './segmented-control'

function Language() {
  const [value, setValue] = useState<'cs' | 'en'>('cs')
  return (
    <SegmentedControl
      label="Language"
      value={value}
      onValueChange={setValue}
      items={[
        { value: 'cs', label: 'Čeština', content: 'CS' },
        { value: 'en', label: 'English', content: 'EN' },
      ]}
    />
  )
}

describe('SegmentedControl', () => {
  it('is a named radio group whose items carry their labels', () => {
    render(<Language />)
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeTruthy()
    const checked = screen.getByRole('radio', { name: 'Čeština' })
    expect(checked.getAttribute('aria-checked')).toBe('true')
    // The selected look keys on aria-checked: the tooltip trigger around each item takes over
    // data-state (closed / delayed-open), so a data-state=checked style would never apply.
    expect(checked.getAttribute('data-state')).toBe('closed')
    expect(checked.className).toContain('aria-checked:bg-state-selected')
  })

  it('selects with a click and with the arrow keys, as one tab stop', async () => {
    const user = userEvent.setup()
    render(<Language />)
    await user.click(screen.getByRole('radio', { name: 'English' }))
    expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true')
    // Held like a real key: Radix moves focus on a timer and checks the item only while the
    // arrow is still down, so an instant press would only move focus.
    await user.keyboard('{ArrowLeft>}')
    const czech = screen.getByRole('radio', { name: 'Čeština' })
    await waitFor(() => {
      expect(document.activeElement).toBe(czech)
    })
    await user.keyboard('{/ArrowLeft}')
    expect(czech.getAttribute('aria-checked')).toBe('true')
  })
})
