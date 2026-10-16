import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Slider } from './slider'

function Weight() {
  const [value, setValue] = useState(50)
  return (
    <Slider
      label="Expired training"
      help="Base priority."
      value={value}
      onValueChange={setValue}
      min={0}
      max={100}
      step={5}
      format={v => `${String(v)} pts`}
    />
  )
}

describe('Slider', () => {
  it('is a named slider that prints and announces its value', () => {
    render(<Weight />)
    const slider = screen.getByRole('slider', { name: 'Expired training' })
    expect(slider.getAttribute('aria-valuetext')).toBe('50 pts')
    expect(screen.getByText('50 pts').tagName).toBe('OUTPUT')
    expect(slider.getAttribute('aria-describedby')).toBe(screen.getByText('Base priority.').id)
  })

  it('steps with the keyboard and clamps at the ends', async () => {
    const user = userEvent.setup()
    render(<Weight />)
    const slider = screen.getByRole('slider', { name: 'Expired training' })
    slider.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(slider.getAttribute('aria-valuenow')).toBe('60')
    await user.keyboard('{End}{ArrowRight}')
    expect(slider.getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByText('100 pts')).toBeTruthy()
  })
})
