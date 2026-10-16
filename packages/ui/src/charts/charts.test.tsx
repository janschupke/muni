import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

describe('Meter tones', () => {
  it.each([
    ['success', 'bg-success-fill'],
    ['warning', 'bg-warning-fill'],
    ['serious', 'bg-serious-fill'],
    ['danger', 'bg-danger-fill'],
  ] as const)('%s fills with %s, and over capacity is still critical', (tone, fill) => {
    const { unmount } = render(<Meter value={28} max={30} label="Obsazeno" tone={tone} />)
    expect(screen.getByRole('meter').firstElementChild?.className).toContain(fill)
    unmount()
    render(<Meter value={31} max={30} label="Obsazeno" tone={tone} />)
    expect(screen.getByRole('meter').firstElementChild?.className).toContain('bg-danger-fill')
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
    ['FULL', 'bg-heat-full'],
    ['HIGH', 'bg-heat-high'],
    ['FAIR', 'bg-heat-fair'],
    ['LOW', 'bg-heat-low'],
    ['POOR', 'bg-heat-poor'],
  ] as const)('band %s uses %s with its own ink', (band, fill) => {
    render(
      <HeatCell band={band} title="Knihovna · BOZP: 80 %">
        80 %
      </HeatCell>
    )
    const cell = screen.getByTitle('Knihovna · BOZP: 80 %')
    expect(cell.tagName).toBe('DIV')
    expect(cell.className).toContain(fill)
    expect(cell.className).toContain(`${fill.replace('bg-', 'text-')}-ink`)
  })

  it('leaves a cell with no value uncoloured', () => {
    render(
      <HeatCell band={null} title="nic">
        —
      </HeatCell>
    )
    expect(screen.getByTitle('nic').className).toContain('text-fg-subtle')
  })

  it('is a button when it opens something', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <HeatCell band="LOW" title="Laboratoře · BOZP: 60 %" onClick={onClick} aria-haspopup="dialog">
        60 %
      </HeatCell>
    )
    const cell = screen.getByRole('button', { name: '60 %' })
    expect(cell.getAttribute('aria-haspopup')).toBe('dialog')
    await user.click(cell)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('labels the colour scale and the series', () => {
    const { container } = render(
      <>
        <HeatLegend
          label="Pásma"
          items={[
            { band: 'FULL', label: '100 %' },
            { band: 'POOR', label: 'pod 50 %' },
          ]}
        />
        <Legend
          items={[
            { key: 'valid', label: 'Platné', swatchClassName: 'bg-status-valid' },
            { key: 'missing', label: 'Chybí', swatchClassName: 'bg-status-missing' },
          ]}
        />
      </>
    )
    expect(container.querySelectorAll('.bg-heat-full, .bg-heat-poor')).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'Pásma' }).textContent).toBe('100 %pod 50 %')
    expect(screen.getAllByRole('listitem').map(i => i.textContent)).toEqual([
      '100 %',
      'pod 50 %',
      'Platné',
      'Chybí',
    ])
  })
})
