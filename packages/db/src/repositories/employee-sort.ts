import type { ComplianceStatus, EmploymentStatus } from '@muni/domain/enums'

import type { EmployeeListItem } from './employees'

export const EMPLOYEE_SORT_KEYS = [
  'name',
  'department',
  'position',
  'status',
  'compliance',
  'required',
] as const
export type EmployeeSortKey = (typeof EMPLOYEE_SORT_KEYS)[number]

const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' })

// Ascending puts the most urgent first.
const COMPLIANCE_ORDER: Record<ComplianceStatus, number> = {
  EXPIRED: 0,
  MISSING: 1,
  EXPIRING: 2,
  VALID: 3,
}
const STATUS_ORDER: Record<EmploymentStatus, number> = {
  ACTIVE: 0,
  PARENTAL_LEAVE: 1,
  TERMINATED: 2,
}

type SortValue = string | number | null

function sortValue(e: EmployeeListItem, by: Exclude<EmployeeSortKey, 'name'>): SortValue {
  switch (by) {
    case 'department':
      return e.department
    case 'position':
      return e.position
    case 'status':
      return STATUS_ORDER[e.status]
    case 'compliance':
      // The list shows no compliance for people who have left; sort them with the blanks.
      return e.status === 'TERMINATED' || e.compliance === null
        ? null
        : COMPLIANCE_ORDER[e.compliance]
    case 'required':
      return e.counts.total === 0 ? null : (e.counts.VALID + e.counts.EXPIRING) / e.counts.total
  }
}

/**
 * Sorts in place. Missing values go last in both directions, like the client-side tables;
 * ties keep the name order the query returned (Array.prototype.sort is stable).
 */
export function sortEmployees(items: EmployeeListItem[], by: EmployeeSortKey, desc: boolean) {
  if (by === 'name') {
    items.sort((a, b) => {
      const order =
        collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
      return desc ? -order : order
    })
    return
  }
  const values = new Map(items.map(e => [e, sortValue(e, by)]))
  items.sort((a, b) => {
    const va = values.get(a) ?? null
    const vb = values.get(b) ?? null
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
    const order =
      typeof va === 'string' && typeof vb === 'string'
        ? collator.compare(va, vb)
        : Number(va) - Number(vb)
    return desc ? -order : order
  })
}
