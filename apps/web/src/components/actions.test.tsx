// @vitest-environment jsdom
import type { PlanItem } from '@muni/domain/advisor'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BreakdownTable } from '@/features/advisor/breakdown-table'
import { ChoiceFacts, SessionCell, UnplacedCell } from '@/features/bookings/choice-cells'
import { unarchiveAction } from '@/server/actions/archive'
import { removeAssignmentAction } from '@/server/actions/assignments'
import { advisorInput } from '@/test/fixtures'
import { router } from '@/test/next'
import { renderClient } from '@/test/render'

import { PersonLink, RecordLink, UserName } from './archived'
import { RemoveBookingButton } from './remove-booking-button'
import { UnarchiveButton } from './unarchive-button'

vi.mock('@/server/actions/assignments', () => ({ removeAssignmentAction: vi.fn() }))
vi.mock('@/server/actions/archive', () => ({ unarchiveAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const [T016, T018] = advisorInput().sessions
if (!T016 || !T018) throw new Error('fixture')

describe('removing a booking', () => {
  const remove = async () => {
    const user = userEvent.setup()
    renderClient(
      <RemoveBookingButton
        sessionExternalId="T018"
        employeeExternalId="E0153"
        label="Remove Černá Marie"
        confirmTitle="Remove Černá Marie from this session?"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Remove Černá Marie' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Černá Marie from this session?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))
    return dialog
  }

  it('says the seat is back once removed', async () => {
    vi.mocked(removeAssignmentAction).mockResolvedValue({ ok: true })
    await remove()
    expect(await screen.findByText('Booking cancelled')).toBeTruthy()
    expect(removeAssignmentAction).toHaveBeenCalledWith({
      sessionExternalId: 'T018',
      employeeExternalId: 'E0153',
    })
  })

  it('says when it was gone already, and why the server refused otherwise', async () => {
    vi.mocked(removeAssignmentAction).mockResolvedValue({ ok: false, reason: 'gone' })
    const gone = await remove()
    expect(await within(gone).findByText('This booking was already cancelled.')).toBeTruthy()
  })

  it('says why the server turned it away', async () => {
    vi.mocked(removeAssignmentAction).mockResolvedValue({ ok: false, reason: 'unauthorized' })
    const dialog = await remove()
    expect(
      await within(dialog).findByText('your account may no longer make changes; sign in again')
    ).toBeTruthy()
  })
})

describe('bringing a record back', () => {
  it('asks, brings it back and goes where its page was opened from', async () => {
    const user = userEvent.setup()
    vi.mocked(unarchiveAction).mockResolvedValue({ status: 'done', href: '/rooms/r1' })
    renderClient(<UnarchiveButton kind="room" id="r1" name="Aula" then="/rooms" />)
    await user.click(screen.getByRole('button', { name: 'Bring back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Bring back Aula?' })
    await user.click(within(dialog).getByRole('button', { name: 'Bring back' }))
    expect(await screen.findByText('Brought back: Aula')).toBeTruthy()
    await waitFor(() => {
      expect(router.push).toHaveBeenLastCalledWith('/rooms/r1')
    })
  })

  it('in a list, from its row', async () => {
    const user = userEvent.setup()
    vi.mocked(unarchiveAction).mockResolvedValue({ status: 'done' })
    renderClient(<UnarchiveButton kind="room" id="r1" name="Aula" compact />)
    await user.click(screen.getByRole('button', { name: /Aula/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Bring back Aula?' })
    await user.click(within(dialog).getByRole('button', { name: 'Bring back' }))
    expect(await screen.findByText('Brought back: Aula')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('archived names', () => {
  it('name an archived person or user by their tag, without a link', () => {
    renderClient(
      <>
        <PersonLink person={{ archived: true, tag: 'ab12cd' }} />
        <PersonLink person={{ archived: false, externalId: 'E1', name: 'Novák Jan' }} emphasis />
        <UserName user={{ archived: true, tag: 'ff00aa' }} />
        <p>
          <UserName user={{ archived: false, id: 'u', name: null, email: 'a@b.cz' }} />
        </p>
        <p>
          <UserName user={{ archived: false, id: 'u', name: null, email: null }} />
        </p>
        <RecordLink href="/rooms/r" archived>
          Stará aula
        </RecordLink>
      </>
    )
    expect(screen.getByText('Archived employee #ab12cd').closest('a')).toBeNull()
    expect(screen.getByRole('link', { name: 'Novák Jan' }).getAttribute('href')).toBe(
      '/employees/E1'
    )
    expect(screen.getByText('Archived user #ff00aa')).toBeTruthy()
    expect(screen.getByText('a@b.cz')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('Stará aula').closest('a')).toBeNull()
  })
})

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
