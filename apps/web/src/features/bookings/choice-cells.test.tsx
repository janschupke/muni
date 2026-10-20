// @vitest-environment jsdom
import type { PlanItem } from '@muni/domain/advisor'
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BreakdownTable } from '@/features/advisor/breakdown-table'
import { ChoiceFacts, SessionCell, UnplacedCell } from '@/features/bookings/choice-cells'
import { advisorInput } from '@/test/fixtures'
import { renderClient } from '@/test/render'

vi.mock('@/server/actions/assignments', () => ({ removeAssignmentAction: vi.fn() }))

vi.mock('@/server/actions/archive', () => ({ unarchiveAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const [T016, T018] = advisorInput().sessions
if (!T016 || !T018) throw new Error('fixture')

describe('session choices', () => {
  it('say how full a session is, and the gap it leaves or that it ends in time', () => {
    renderClient(
      <>
        <ChoiceFacts choice={{ session: T018, window: null }} asOf="2026-10-16" />
        <ChoiceFacts
          choice={{ session: T018, window: { from: '2026-12-01', until: '2027-02-03', days: 64 } }}
          asOf="2026-10-16"
        />
        <ChoiceFacts
          choice={{ session: T018, window: { from: '2026-09-02', until: '2027-02-03', days: 154 } }}
          asOf="2026-10-16"
        />
        <SessionCell session={T018} employee="E0153" />
      </>
    )
    expect(screen.getAllByText('0 of 30 seats booked')).toHaveLength(3)
    expect(screen.getByText('Ends before the training lapses')).toBeTruthy()
    expect(screen.getByText('Starts after it lapses: 64 days without it')).toBeTruthy()
    expect(screen.getByText('Without it until 03.02.2027')).toBeTruthy()
    expect(screen.getByRole('link', { name: /03.02.2027/ }).getAttribute('href')).toBe(
      '/sessions/T018?employee=E0153'
    )
  })

  it('send a clash to the person’s bookings, and a full or missing session to scheduling', () => {
    const item = (reason: 'CONFLICT' | 'NO_SEATS'): PlanItem => ({
      need: {
        employee: {
          externalId: 'E0153',
          name: 'Černá Marie',
          department: null,
          departmentId: null,
          positionId: null,
          status: 'ACTIVE',
        },
        course: { code: 'BOZP-Z', name: 'BOZP' },
        status: 'EXPIRED',
        validUntil: '2026-09-01',
      },
      bucket: 'now',
      lapses: '2026-09-02',
      booked: null,
      remediation: 'ACTION_REQUIRED',
      window: { from: '2026-09-02', until: null, days: null },
      proposal: { kind: 'NONE', rank: 1, reason },
    })
    renderClient(
      <>
        <UnplacedCell item={item('CONFLICT')} />
        <UnplacedCell item={item('NO_SEATS')} />
        <UnplacedCell item={{ ...item('NO_SEATS'), proposal: null }} />
      </>
    )
    expect(screen.getByText('Clashes with their other bookings')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See their bookings' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(screen.getByRole('link', { name: 'Schedule a session' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z/sessions/new'
    )
  })

  it('show a training never held, with no department, in a breakdown row', () => {
    const never: PlanItem = {
      need: {
        employee: {
          externalId: 'E9',
          name: 'Nový Jan',
          department: null,
          departmentId: null,
          positionId: null,
          status: 'ACTIVE',
        },
        course: { code: 'GDPR', name: 'GDPR' },
        status: 'MISSING',
        validUntil: null,
      },
      bucket: 'now',
      lapses: null,
      booked: T018,
      remediation: 'PLANNED',
      window: null,
      proposal: null,
    }
    renderClient(
      <BreakdownTable
        items={[never]}
        total={1}
        paging={{ local: 'a test' }}
        bucket="now"
        asOf="2026-10-16"
        canBook={false}
      />
    )
    const row = screen.getByRole('row', { name: /Nový Jan/ })
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
    expect(
      within(row)
        .getByRole('link', { name: /03.02.2027/ })
        .getAttribute('href')
    ).toBe('/sessions/T018')
  })
})
