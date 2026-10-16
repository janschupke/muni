import { describe, expect, it } from 'vitest'

import { sortEmployees } from './employee-sort'
import type { EmployeeListItem } from './employees'

const counts = (valid: number, total: number) => ({
  VALID: valid,
  EXPIRING: 0,
  EXPIRED: 0,
  MISSING: total - valid,
  total,
})

function employee(
  externalId: string,
  lastName: string,
  firstName: string,
  extra: Partial<EmployeeListItem> = {}
): EmployeeListItem {
  return {
    externalId,
    lastName,
    firstName,
    department: null,
    position: null,
    status: 'ACTIVE',
    compliance: null,
    counts: counts(0, 0),
    ...extra,
  }
}

const ids = (items: EmployeeListItem[]) => items.map(e => e.externalId)

describe('sortEmployees', () => {
  it('orders names by Czech rules: surname, then first name', () => {
    const items = [
      employee('E1', 'Zeman', 'Petr'),
      employee('E2', 'Čermák', 'Jiří'),
      employee('E3', 'Chalupa', 'Jan'),
      employee('E4', 'Cibulka', 'Eva'),
      employee('E5', 'Čermák', 'Adam'),
      employee('E6', 'Hora', 'Karel'),
    ]
    sortEmployees(items, 'name', false)
    // c < č < h < ch < z, and Adam before Jiří within Čermák.
    expect(ids(items)).toEqual(['E4', 'E5', 'E2', 'E6', 'E3', 'E1'])
    sortEmployees(items, 'name', true)
    expect(ids(items)).toEqual(['E1', 'E3', 'E6', 'E2', 'E5', 'E4'])
  })

  it('puts blanks last in both directions and keeps ties in their prior order', () => {
    const items = [
      employee('E1', 'A', 'a', { department: 'Laboratoře' }),
      employee('E2', 'B', 'b', { department: null }),
      employee('E3', 'C', 'c', { department: 'Knihovna' }),
      employee('E4', 'D', 'd', { department: 'Laboratoře' }),
    ]
    sortEmployees(items, 'department', false)
    expect(ids(items)).toEqual(['E3', 'E1', 'E4', 'E2'])
    sortEmployees(items, 'department', true)
    expect(ids(items)).toEqual(['E1', 'E4', 'E3', 'E2'])
  })

  it('sorts compliance by urgency and treats people who left as blank', () => {
    const items = [
      employee('E1', 'A', 'a', { compliance: 'VALID' }),
      employee('E2', 'B', 'b', { compliance: 'EXPIRED', status: 'TERMINATED' }),
      employee('E3', 'C', 'c', { compliance: 'MISSING' }),
      employee('E4', 'D', 'd', { compliance: 'EXPIRED' }),
      employee('E5', 'E', 'e', { compliance: 'EXPIRING' }),
    ]
    sortEmployees(items, 'compliance', false)
    expect(ids(items)).toEqual(['E4', 'E3', 'E5', 'E1', 'E2'])
  })

  it('sorts required trainings by the share held; nothing required sorts last', () => {
    const items = [
      employee('E1', 'A', 'a', { counts: counts(3, 4) }),
      employee('E2', 'B', 'b', { counts: counts(0, 0) }),
      employee('E3', 'C', 'c', { counts: counts(1, 4) }),
      employee('E4', 'D', 'd', { counts: counts(5, 5) }),
    ]
    sortEmployees(items, 'required', true)
    expect(ids(items)).toEqual(['E4', 'E1', 'E3', 'E2'])
  })
})
