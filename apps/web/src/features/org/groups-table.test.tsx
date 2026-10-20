// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { counts, departmentSummary, positionSummary } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { GroupsTable } from './groups-table'

const NONE = counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 })

/** The group each row names, top to bottom. */
const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('link')[0]?.textContent)

describe('GroupsTable', () => {
  it('sorts departments by head and by compliance, those without either last', async () => {
    const user = userEvent.setup()
    renderClient(
      <GroupsTable
        kind="departments"
        paging={{ local: 'a test of the table' }}
        groups={[
          departmentSummary({
            id: 'dep_lab',
            name: 'Laboratoře',
            head: { archived: false, externalId: 'E0002', name: 'Veselá Eva' },
            rate: 0.9,
          }),
          departmentSummary({
            id: 'dep_lib',
            name: 'Knihovna',
            head: null,
            counts: NONE,
            rate: 0,
            upcomingBookings: 0,
            memberCount: 0,
          }),
          departmentSummary({
            id: 'dep_it',
            name: 'IT',
            head: { archived: false, externalId: 'E0001', name: 'Adámek Petr' },
            rate: 0.5,
          }),
        ]}
      />
    )
    expect(names()).toEqual(['Laboratoře', 'Knihovna', 'IT'])
    // No head, no mandatory training: a dash, not a zero.
    const library = screen.getByRole('row', { name: /^Knihovna/ })
    expect(within(library).getAllByText('—')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Head' }))
    // The first link of a headed row is the department; its head follows.
    expect(names()).toEqual(['IT', 'Laboratoře', 'Knihovna'])

    await user.click(screen.getByRole('button', { name: 'Compliance' }))
    expect(names()).toEqual(['IT', 'Laboratoře', 'Knihovna'])
    await user.click(screen.getByRole('button', { name: 'Compliance' }))
    expect(names()).toEqual(['Laboratoře', 'IT', 'Knihovna'])
  })

  it('sorts positions by the departments they sit in', async () => {
    const user = userEvent.setup()
    renderClient(
      <GroupsTable
        kind="positions"
        paging={{ local: 'a test of the table' }}
        groups={[
          positionSummary({ id: 'pos_lab', name: 'Laborant' }),
          positionSummary({ id: 'pos_new', name: 'Stážista', departments: [] }),
          positionSummary({
            id: 'pos_it',
            name: 'Správce sítě',
            departments: [{ id: 'dep_it', name: 'IT', count: 2 }],
          }),
        ]}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Departments' }))
    expect(names()).toEqual(['Stážista', 'Správce sítě', 'Laborant'])
  })
})
