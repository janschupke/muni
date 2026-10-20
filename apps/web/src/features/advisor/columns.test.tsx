// @vitest-environment jsdom
import type { AdvisorSession, PlanItem } from '@muni/domain/advisor'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { PlannedTable } from './planned-table'

vi.mock('@/server/actions/assignments', () => ({
  removeAssignmentAction: vi.fn(() => Promise.resolve({ ok: true })),
}))

const booked = (id: string, date: string): AdvisorSession => ({
  externalId: id,
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  room: { id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM' },
  roomCapacity: 40,
  startsAt: `${date}T07:00:00.000Z`,
  endsAt: `${date}T10:00:00.000Z`,
  capacity: 10,
  unnamedBookings: 0,
  assigned: [],
  pricePerPerson: 450,
  status: 'PLANNED',
})

const item = (
  name: string,
  course: string,
  lapses: string | null,
  session: AdvisorSession | null,
  days: number | null
): PlanItem => ({
  need: {
    employee: {
      externalId: `E_${name}`,
      name,
      department: name === 'Adámek Petr' ? null : 'Laboratoře',
      departmentId: 'dep_lab',
      positionId: 'pos_lab',
      status: 'ACTIVE',
    },
    course: { code: course, name: course },
    status: 'EXPIRING',
    validUntil: lapses,
  },
  bucket: 'now',
  lapses,
  booked: session,
  remediation: days === null ? 'PLANNED' : 'PLANNED_LATE',
  window: days === null ? null : { from: lapses, until: lapses, days },
  proposal: null,
})

// Each column orders the three differently, so every sort is told apart from the others.
// (Czech collation puts “Ch” after “H”: the names avoid it.)
const ITEMS: PlanItem[] = [
  item('Bílá Jana', 'Bezpečnost', '2026-11-20', booked('T2', '2026-11-05'), 9),
  // Never held, nothing booked, in no department.
  { ...item('Adámek Petr', 'Elektro', null, null, null), remediation: 'ACTION_REQUIRED' },
  item('Cibulka Ota', 'Asbest', '2026-11-01', booked('T1', '2026-11-25'), 3),
]

const people = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('link')[0]?.textContent)

const sortBy = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name }))
}

describe('the advisor’s shared columns', () => {
  it('sort a local table by person, course, lapse, booked session and gap', async () => {
    const user = userEvent.setup()
    renderClient(
      <PlannedTable
        items={ITEMS}
        total={ITEMS.length}
        paging={{ local: 'a test of the columns' }}
        asOf="2026-10-16"
        canEdit
      />
    )
    expect(people()).toEqual(['Bílá Jana', 'Adámek Petr', 'Cibulka Ota'])
    // Only a booking can be cancelled.
    expect(screen.getAllByRole('button', { name: /^Cancel the booking of/ })).toHaveLength(2)

    await sortBy(user, 'Person')
    expect(people()).toEqual(['Adámek Petr', 'Bílá Jana', 'Cibulka Ota'])

    await sortBy(user, 'Course')
    expect(people()).toEqual(['Cibulka Ota', 'Bílá Jana', 'Adámek Petr'])

    // A training never held has no lapse date: it sorts last.
    await sortBy(user, 'Lapses')
    expect(people()).toEqual(['Cibulka Ota', 'Bílá Jana', 'Adámek Petr'])

    await sortBy(user, 'Booked session')
    expect(people()).toEqual(['Bílá Jana', 'Cibulka Ota', 'Adámek Petr'])

    // No gap at all sorts last too.
    await sortBy(user, 'Without the training')
    expect(people()).toEqual(['Cibulka Ota', 'Bílá Jana', 'Adámek Petr'])
    await sortBy(user, 'Without the training')
    expect(people()).toEqual(['Bílá Jana', 'Cibulka Ota', 'Adámek Petr'])
  })
})
