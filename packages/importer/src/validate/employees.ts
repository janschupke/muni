import { sortName } from '@muni/domain/names'
import type { EmployeeInput } from '@muni/domain/schemas'

import { isCommitted } from '../row-state'
import type { ParsedRow, ReferenceSnapshot } from '../types'
import { checkManagers } from './managers'
import type { Organisation } from './organisation'
import {
  type Archived,
  archivedIssue,
  duplicateId,
  duplicateOf,
  type Extra,
  finalize,
  firstRowByKey,
  hasError,
  issue,
  normalized,
  usable,
} from './shared'

/**
 * People: one row per ID, one person per email or birth number (a second row for the same
 * person is refused and their records remapped to the first), department and position spelled
 * as the register spells them, and manager links that hold (`checkManagers`). Also who the
 * later files may name: every person the register or the import has, by ID, with their name.
 */
export function validateEmployees(
  rows: ParsedRow<EmployeeInput>[],
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
  const firstById = firstRowByKey(rows, d => d.externalId)
  const firstByEmail = firstRowByKey(rows, d => d.email)
  const firstByNationalId = firstRowByKey(rows, d => d.nationalId)
  const idByEmail = new Map(
    reference.employees.flatMap(e => (e.email ? [[e.email, e.externalId] as const] : []))
  )
  /** Duplicate person ID → the ID that survives. */
  const aliases = new Map<string, string>()

  const checked = rows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data

    const owner = duplicateId(extra, 'externalId', row, firstById, data.externalId)
    if (archived.employee(data.externalId)) extra.push(archivedIssue('externalId', data.externalId))
    if (archived.employeeEmail(data.managerEmail))
      extra.push(archivedIssue('managerEmail', data.managerEmail ?? ''))
    if (archived.department(data.department))
      extra.push(archivedIssue('department', data.department ?? ''))
    if (archived.position(data.position)) extra.push(archivedIssue('position', data.position ?? ''))
    if (!owner) {
      const twin =
        duplicateOf(row, firstByEmail, data.email) ??
        duplicateOf(row, firstByNationalId, data.nationalId)
      const twinId = twin?.base.data?.externalId
      const registerTwin = data.email ? idByEmail.get(data.email) : undefined
      if (twinId && twinId !== data.externalId) {
        extra.push(
          issue('row', 'DUPLICATE_PERSON', 'error', { otherId: twinId, firstRow: twin.rowNumber })
        )
        aliases.set(data.externalId, twinId)
      } else if (registerTwin && registerTwin !== data.externalId) {
        extra.push(issue('row', 'DUPLICATE_PERSON', 'error', { otherId: registerTwin }))
        aliases.set(data.externalId, registerTwin)
      }
    }

    const department = data.department && departments.canonical(data.department)
    normalized(extra, 'department', data.department, department)
    const position = data.position && positions.canonical(data.position)
    normalized(extra, 'position', data.position, position)
    // Announced on a row that will be imported, not on one an error leaves out.
    if (!hasError(row, extra))
      extra.push(
        ...organisation.newDepartment('department', department),
        ...organisation.newPosition('position', position)
      )
    return finalize<EmployeeInput>(row, { ...data, department, position }, extra)
  })

  const ids = new Set(reference.employees.map(e => e.externalId))
  const names = new Map(reference.employees.map(e => [e.externalId, e.fullName]))
  for (const row of checked) {
    if (!isCommitted(row)) continue
    ids.add(row.data.externalId)
    names.set(row.data.externalId, sortName(row.data))
  }
  return { rows: checkManagers(checked, idByEmail), aliases, ids, names }
}
