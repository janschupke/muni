import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '../test/render'
import { Meter } from './meter'
import { StatCard } from './stat-card'

function FakeLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <a href={href} className={className} data-router="yes">
      {children}
    </a>
  )
}

describe('StatCard', () => {
  it('becomes a link to what it counts, through the app’s link component', () => {
    render(
      <StatCard
        label="Expired"
        value="12"
        hint="9 people"
        href="/employees?compliance=EXPIRED"
        linkAs={FakeLink}
        tone="serious"
      />
    )
    const link = screen.getByRole('link', { name: /Expired\s*12\s*9 people/ })
    expect(link.getAttribute('href')).toBe('/employees?compliance=EXPIRED')
    expect(link.dataset.router).toBe('yes')
  })

  it('is a toggle button when it filters, and plain otherwise', () => {
    const { rerender } = render(
      <StatCard label="Errors" value="2" onClick={() => undefined} pressed />
    )
    expect(screen.getByRole('button', { name: /Errors/ }).getAttribute('aria-pressed')).toBe('true')
    rerender(<StatCard label="Errors" value="2" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('Meter', () => {
  it('reports its value and turns critical past the maximum', () => {
    render(<Meter value={31} max={30} label="Booked" size="lg" />)
    const meter = screen.getByRole('meter', { name: 'Booked' })
    expect(meter.getAttribute('aria-valuenow')).toBe('31')
    expect(meter.className).toContain('h-3')
    expect(meter.firstElementChild?.className).toContain('bg-danger-fill')
  })
})
