// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ONLINE, session } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { SessionAttendees, SessionFacts } from './session-details'

/** The value a description list gives for a term. */
const valueOf = (term: string) => screen.getByText(term).nextElementSibling?.textContent

describe('SessionFacts', () => {
  it('shows an online session with no needs, no price and more booked than seats', () => {
    renderClient(
      <SessionFacts
        session={session({
          room: ONLINE,
          roomSeats: null,
          roomCapabilities: [],
          needs: { sessionMinutes: null, seats: null, onlineAllowed: true, capabilities: [] },
          capacity: 10,
          unnamedBookings: 11,
          bookedCount: 12,
          pricePerPerson: null,
        })}
      />
    )
    expect(valueOf('Room')).toContain('online')
    expect(valueOf('Room')).toContain('The room suits it.')
    // An online room is all the course asks for here.
    expect(valueOf('The course needs')).toBe('can be online')
    expect(valueOf('Seats')).toBe('1 by name · 11 without a name · none free · 2 over capacity')
    expect(valueOf('Price')).toBe('Not set')
    // Not the full page: no course, no ID.
    expect(screen.queryByText('Course')).toBeNull()
    expect(screen.queryByText('ID')).toBeNull()
  })

  it('leaves out what the course needs when it needs nothing', () => {
    renderClient(
      <SessionFacts
        full
        session={session({
          needs: { sessionMinutes: null, seats: null, onlineAllowed: false, capabilities: [] },
        })}
      />
    )
    expect(screen.queryByText('The course needs')).toBeNull()
    expect(valueOf('ID')).toBe('T016')
    expect(screen.getByRole('link', { name: 'BOZP – základní školení' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z'
    )
  })
})

describe('SessionAttendees', () => {
  it('lists each person booked, how, and an archived one by tag', () => {
    const [cerna] = session().bookings
    if (!cerna) throw new Error('fixture')
    renderClient(
      <SessionAttendees
        session={session({
          bookings: [
            cerna,
            {
              ...cerna,
              person: { archived: true, tag: 'c3' },
              departmentId: null,
              department: null,
              positionId: null,
              position: null,
              source: 'MANUAL',
            },
          ],
        })}
      />
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const [first, second] = rows
    if (!first || !second) throw new Error('rows')
    expect(within(first).getByText('Advisor')).toBeTruthy()
    expect(within(second).getByText('Archived employee #c3')).toBeTruthy()
    expect(within(second).getByText('By hand')).toBeTruthy()
    // No action column unless the page gives one.
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
  })
})
