import type { CourseInput } from '@muni/domain/schemas'

import { isCommitted } from '../row-state'
import type { ParsedRow, ReferenceSnapshot } from '../types'
import type { Organisation } from './organisation'
import {
  type Archived,
  archivedIssue,
  checkRef,
  duplicateId,
  type Extra,
  finalize,
  firstRowByKey,
  usable,
} from './shared'

/**
 * Courses: one row per code, and requirements that reach someone (a department or position
 * people belong to), spelled as the register spells them. Also the validity of every course
 * the batch may refer to: the register's, overridden by the batch's.
 */
export function validateCourses(
  rows: ParsedRow<CourseInput>[],
  {
    archived,
    organisation,
    reference,
  }: {
    archived: Archived
    organisation: Organisation
    reference: ReferenceSnapshot
  }
) {
  const { departments, positions } = organisation
  const first = firstRowByKey(rows, d => d.code)
  const out = rows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data
    duplicateId(extra, 'code', row, first, data.code)
    if (archived.course(data.code)) extra.push(archivedIssue('code', data.code))

    const requirements = data.requirements.map(r => {
      if (r.scope === 'DEPARTMENT') {
        checkRef(extra, 'requiredFor', r.department, {
          archived: archived.department(r.department),
          known: organisation.isStaffedDepartment(r.department),
          unknown: ['UNKNOWN_DEPARTMENT', 'warning'],
        })
        return { ...r, department: departments.canonical(r.department) }
      }
      if (r.scope === 'POSITION') {
        checkRef(extra, 'requiredFor', r.position, {
          archived: archived.position(r.position),
          known: organisation.isStaffedPosition(r.position),
          unknown: ['UNKNOWN_POSITION', 'warning'],
        })
        return { ...r, position: positions.canonical(r.position) }
      }
      return r
    })
    return finalize<CourseInput>(row, { ...data, requirements }, extra)
  })

  const validity = new Map<string, number | null>(
    reference.courses.map(c => [c.code, c.validityMonths])
  )
  for (const row of out) if (isCommitted(row)) validity.set(row.data.code, row.data.validityMonths)
  return { rows: out, validity }
}
