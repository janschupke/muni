import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '../../test/render'
import { ChoiceGroup } from './choice-group'

describe('ChoiceGroup', () => {
  function Harness() {
    const [value, setValue] = useState<'move' | 'raise'>('move')
    return (
      <>
        <ChoiceGroup
          label="How to resolve it"
          value={value}
          onValueChange={setValue}
          choices={[
            { value: 'move', title: 'Move seats', description: 'Up to 3 seats.' },
            { value: 'raise', title: 'Raise the capacity', disabled: false },
          ]}
        />
        <p>Chosen: {value}</p>
      </>
    )
  }

  it('offers each way with what it means, one chosen at a time', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'How to resolve it' })
    expect(within(group).getByText('Up to 3 seats.')).toBeTruthy()
    expect(
      within(group)
        .getByRole('radio', { name: /Move seats/ })
        .getAttribute('aria-checked')
    ).toBe('true')
    await user.click(within(group).getByRole('radio', { name: /Raise the capacity/ }))
    expect(screen.getByText('Chosen: raise')).toBeTruthy()
    // Only the chosen card looks chosen.
    expect(
      within(group)
        .getByRole('radio', { name: /Move seats/ })
        .getAttribute('data-state')
    ).toBe('unchecked')
    expect(
      within(group)
        .getByRole('radio', { name: /Raise the capacity/ })
        .getAttribute('data-state')
    ).toBe('checked')
  })
})
