import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BarRow } from '../components/bar-row'
import { Meter } from '../components/meter'
import { HeatCell, HeatLegend } from './heat-cell'
import { Legend } from './legend'
import { StackedBar } from './stacked-bar'

const segments = [
  { key: 'valid', label: 'Platné', value: 6, fillClass: 'bg-status-valid' },
  { key: 'expired', label: 'Prošlé', value: 0, fillClass: 'bg-status-expired' },
  { key: 'missing', label: 'Chybí', value: 2, fillClass: 'bg-status-missing' },
]

describe('StackedBar', () => {
  it('names every segment, draws only the non-empty ones, and sizes them by share', () => {
    const { container } = render(<StackedBar label="Laboratoře" segments={segments} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Laboratoře: Platné 6, Prošlé 0, Chybí 2'
    )
    const drawn = container.querySelectorAll('[title]')
    expect([...drawn].map(s => [s.getAttribute('title'), (s as HTMLElement).style.width])).toEqual([
      ['Platné: 6', '75%'],
      ['Chybí: 2', '25%'],
    ])
  })

  it('draws an empty track when there is nothing to show', () => {
    const { container } = render(
      <StackedBar label="Archiv" segments={segments.map(s => ({ ...s, value: 0 }))} />
    )
    expect(container.querySelectorAll('[title]')).toHaveLength(0)
  })
})

describe('Meter', () => {
  it.each([
    [12, 30, '40%', 'bg-accent'],
    [31, 30, '100%', 'bg-danger-fill'],
    [0, 0, '0%', 'bg-accent'],
    // No seats at all but someone booked: over capacity.
    [1, 0, '100%', 'bg-danger-fill'],
  ])('%i of %i fills %s', (value, max, width, fill) => {
    render(<Meter value={value} max={max} label="Obsazeno" size="lg" />)
    const meter = screen.getByRole('meter', { name: 'Obsazeno' })
    expect(meter.getAttribute('aria-valuenow')).toBe(String(value))
    expect(meter.className).toContain('h-3')
    const bar = meter.firstElementChild as HTMLElement
    expect(bar.style.width).toBe(width)
    expect(bar.className).toContain(fill)
  })
})

describe('BarRow', () => {
  it('stacks label and value over the bar, or lines them up inline', () => {
    render(
      <>
        <BarRow label="Laboratoře" value="87 %" bar={<span>bar-a</span>} />
        <BarRow layout="inline" value="12 / 30" bar={<span>bar-b</span>} after={<b>Plno</b>} />
      </>
    )
    expect(screen.getByText('Laboratoře').nextElementSibling?.textContent).toBe('87 %')
    expect(screen.getByText('12 / 30').nextElementSibling?.textContent).toBe('Plno')
  })
})

describe('HeatCell and legends', () => {
  it.each([
    [0, 'bg-seq-1'],
    [0.5, 'bg-seq-4'],
    [1, 'bg-seq-6'],
    [-1, 'bg-seq-1'],
  ])('intensity %f uses %s', (intensity, step) => {
    render(
      <HeatCell intensity={intensity} title="Knihovna · BOZP: 80 %">
        80 %
      </HeatCell>
    )
    expect(screen.getByTitle('Knihovna · BOZP: 80 %').className).toContain(step)
  })

  it('leaves a cell with no value uncoloured', () => {
    render(
      <HeatCell intensity={null} title="nic">
        —
      </HeatCell>
    )
    expect(screen.getByTitle('nic').className).toContain('text-fg-subtle')
  })

  it('labels the colour scale and the series', () => {
    const { container } = render(
      <>
        <HeatLegend low="0 %" high="100 %" />
        <Legend
          items={[
            { key: 'valid', label: 'Platné', swatchClassName: 'bg-status-valid' },
            { key: 'missing', label: 'Chybí', swatchClassName: 'bg-status-missing' },
          ]}
        />
      </>
    )
    expect(container.querySelectorAll('.bg-seq-1, .bg-seq-6')).toHaveLength(2)
    expect(screen.getAllByRole('listitem').map(i => i.textContent)).toEqual(['Platné', 'Chybí'])
  })
})
