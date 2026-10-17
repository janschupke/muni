import type { ComplianceStatus, EmployeeSortKey, EmploymentState } from '@muni/domain/enums'

import type { EmployeeListItem } from './employees'
import { type ListQuery, type Page, pageBounds } from './paging'

const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' })

/** Czech name order: surname, then first name. */
export function compareNames(
  a: { lastName: string; firstName: string },
  b: { lastName: string; firstName: string }
): number {
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
}

// Ascending puts the most urgent first.
const COMPLIANCE_ORDER: Record<ComplianceStatus, number> = {
  EXPIRED: 0,
  MISSING: 1,
  EXPIRING: 2,
  VALID: 3,
}
const STATUS_ORDER: Record<EmploymentState, number> = {
  ACTIVE: 0,
  PARENTAL_LEAVE: 1,
  LEFT: 2,
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
      return e.status === 'LEFT' || e.compliance === null ? null : COMPLIANCE_ORDER[e.compliance]
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
    items.sort((a, b) => (desc ? -compareNames(a, b) : compareNames(a, b)))
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

/**
 * One page of people sorted by the column asked for, without a sort in the order they come in
 * (a department's people come most urgent first); the employee list and a department's or
 * position's people page this way.
 */
export function pageEmployees(
  items: readonly EmployeeListItem[],
  query: ListQuery<EmployeeSortKey>
): Page<EmployeeListItem> {
  const sorted = [...items]
  if (query.sort) sortEmployees(sorted, query.sort.by, query.sort.desc)
  const { page, pageSize, pageCount, skip } = pageBounds(sorted.length, query)
  return {
    items: sorted.slice(skip, skip + pageSize),
    total: sorted.length,
    page,
    pageSize,
    pageCount,
  }
}
