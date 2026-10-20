// @vitest-environment jsdom
import { EMPLOYMENT_STATES, SESSION_STATUSES } from '@muni/domain/enums'
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RequirementPanel } from '@/features/compliance/requirement-panel'
import { AULA_A } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import {
  ComplianceBadge,
  EmploymentBadge,
  OccupancyBadge,
  RoleBadge,
  SessionStatusBadge,
} from './status-badges'

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

const PERSON = { externalId: 'E0153', name: 'Černá Marie', status: 'ACTIVE' as const }

describe('badges and small panels', () => {
  it('label every state with an icon and text', () => {
    renderClient(
      <>
        <ComplianceBadge status={null} />
        <EmploymentBadge status="PARENTAL_LEAVE" />
        <SessionStatusBadge status="CANCELLED" />
        <OccupancyBadge booked={3} capacity={10} />
        <RequirementPanel person={PERSON} requirements={[]} canBook />
      </>
    )
    expect(screen.getByText('Nothing required')).toBeTruthy()
    expect(screen.getByText('Parental leave')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.queryByText('Full')).toBeNull()
    expect(screen.queryByText('Almost full')).toBeNull()
    expect(screen.getByText('Nothing is required of this person.')).toBeTruthy()
  })

  it('never wear the brand blue for a state; a role does', () => {
    renderClient(
      <>
        {EMPLOYMENT_STATES.map(state => (
          <EmploymentBadge key={state} status={state} />
        ))}
        {SESSION_STATUSES.map(state => (
          <SessionStatusBadge key={state} status={state} />
        ))}
        <RoleBadge value="ADMIN" />
      </>
    )
    const badges = [...document.querySelectorAll('span')].filter(b =>
      b.className.includes('rounded-sm border')
    )
    const admin = screen.getByText('Admin')
    expect(admin.className).toContain('bg-accent-soft')
    for (const badge of badges.filter(b => b !== admin))
      expect(badge.className, badge.textContent).not.toContain('accent')
  })

  it('show a requirement never completed, and one without a booking, each to book', () => {
    renderClient(
      <RequirementPanel
        person={PERSON}
        canBook
        requirements={[
          {
            courseCode: 'GDPR',
            courseName: 'Ochrana osobních údajů',
            status: 'MISSING',
            completedOn: null,
            validUntil: null,
            daysLeft: null,
            booked: null,
            opening: 'OPEN' as const,
          },
          {
            courseCode: 'BOZP-Z',
            courseName: 'BOZP – základní školení',
            status: 'EXPIRING',
            completedOn: '2024-11-01',
            validUntil: '2026-11-01',
            daysLeft: null,
            booked: null,
            opening: 'OPEN' as const,
          },
        ]}
      />
    )
    const missing = screen.getByRole('row', { name: /Ochrana/ })
    expect(within(missing).getAllByText('—')).toHaveLength(3)
    expect(screen.getByText('01.11.2026')).toBeTruthy()
    // Missing and expiring, nothing booked: both can be booked from here.
    expect(
      screen.getAllByRole('button', { name: /^Book .* for Černá Marie…$/ }).map(b => b.textContent)
    ).toEqual(['Book…', 'Book…'])
  })

  it('say why a needed training cannot be booked, offer to cancel a booking, and nothing for a valid one', () => {
    const requirement = {
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      status: 'EXPIRED' as const,
      completedOn: '2023-01-01',
      validUntil: '2025-01-01',
      daysLeft: -300,
      booked: null,
      opening: 'OPEN' as const,
    }
    const reasonOf = (button: HTMLElement) =>
      document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent
    const book = () => screen.getByRole('button', { name: /^Book .+ for Černá Marie…$/ })
    // On leave, no session, every one full: in its place, dimmed, saying why.
    for (const [status, opening, reason] of [
      ['PARENTAL_LEAVE', 'OPEN', 'On parental leave: nothing to book until they are back'],
      ['ACTIVE', 'NONE', 'No session of this course is scheduled'],
      ['ACTIVE', 'FULL', 'Every session of this course is full'],
    ] as const) {
      const { unmount } = renderClient(
        <RequirementPanel
          person={{ ...PERSON, status }}
          canBook
          requirements={[{ ...requirement, opening }]}
        />
      )
      expect(book().getAttribute('aria-disabled')).toBe('true')
      expect(reasonOf(book())).toBe(reason)
      unmount()
    }
    // Booked: when and where, and the way to cancel it; valid: nothing to do.
    const { unmount } = renderClient(
      <RequirementPanel
        person={PERSON}
        canBook
        requirements={[
          {
            ...requirement,
            booked: {
              sessionExternalId: 'T016',
              startsAt: '2026-11-04T08:00:00Z',
              endsAt: '2026-11-04T11:00:00Z',
              room: AULA_A,
            },
          },
          { ...requirement, courseCode: 'X', status: 'VALID' },
        ]}
      />
    )
    expect(screen.queryByRole('button', { name: /^Book / })).toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Cancel the booking of Ochrana osobních údajů for Černá Marie',
      })
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Aula A' }).getAttribute('href')).toBe(
      '/rooms/room_aula_a'
    )
    unmount()
    // A reader is offered nothing.
    renderClient(<RequirementPanel person={PERSON} canBook={false} requirements={[requirement]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
