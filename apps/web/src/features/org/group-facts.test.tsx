// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { counts, departmentSummary } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { GroupFacts } from './group-facts'

/** The value a description list gives for a term. */
const valueOf = (term: string) => screen.getByText(term).nextElementSibling

describe('GroupFacts', () => {
  it('links the upcoming bookings to their list', () => {
    renderClient(
      <GroupFacts group={departmentSummary()} bookingsHref="/departments/dep_lab/bookings" />
    )
    expect(valueOf('Active people')?.textContent).toBe('28')
    expect(valueOf('On parental leave')?.textContent).toBe('2')
    expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
      '/departments/dep_lab/bookings'
    )
  })

  it('shows no bookings as a plain zero, and no compliance when nothing is required', () => {
    renderClient(
      <GroupFacts
        group={departmentSummary({
          upcomingBookings: 0,
          counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
        })}
        bookingsHref="/departments/dep_lab/bookings"
      />
    )
    expect(valueOf('Upcoming bookings')?.textContent).toBe('0')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Compliance')).toBeNull()
  })
})
