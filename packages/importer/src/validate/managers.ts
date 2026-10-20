import type { EmployeeInput } from '@muni/domain/schemas'

import { isCommitted } from '../row-state'
import type { ParsedRow } from '../types'
import { issue } from './shared'

/**
 * Who would end up managing themselves: walking up from each person (in file order), a link
 * that leads back to them is dropped, which breaks the loop for everyone else in it.
 */
function managerLoops(links: Map<string, string | null>, order: readonly string[]) {
  const dropped = new Set<string>()
  for (const id of order) {
    const seen = new Set<string>()
    for (let up = links.get(id) ?? null; up !== null && !seen.has(up); up = links.get(up) ?? null) {
      if (up === id) {
        links.set(id, null)
        dropped.add(id)
        break
      }
      seen.add(up)
    }
  }
  return dropped
}

/** Drops a row's manager link, saying why. */
function dropManager(
  row: ParsedRow<EmployeeInput> & { data: EmployeeInput },
  code: 'MANAGER_NOT_FOUND' | 'MANAGER_CYCLE',
  value: string
): ParsedRow<EmployeeInput> {
  return {
    ...row,
    data: { ...row.data, managerEmail: null },
    warnings: [...row.warnings, issue('managerEmail', code, 'warning', { value })],
  }
}

/**
 * Manager links that hold: a manager is someone the register or the import has (by email),
 * and nobody ends up managing themselves, directly or round a loop. A link that fails is
 * dropped with a warning; the person is imported without a manager.
 */
export function checkManagers(
  rows: ParsedRow<EmployeeInput>[],
  idByEmail: ReadonlyMap<string, string>
): ParsedRow<EmployeeInput>[] {
  // Managers must resolve against people that will actually be imported (or already exist).
  const ids = new Map(idByEmail)
  for (const row of rows)
    if (isCommitted(row) && row.data.email) ids.set(row.data.email, row.data.externalId)
  const found = rows.map(row => {
    const managerEmail = row.data?.managerEmail
    if (!row.data || !managerEmail || ids.has(managerEmail) || row.isSkipped) return row
    return dropManager({ ...row, data: row.data }, 'MANAGER_NOT_FOUND', managerEmail)
  })

  const imported = found.filter(isCommitted)
  const links = new Map(
    imported.map(r => [
      r.data.externalId,
      r.data.managerEmail ? (ids.get(r.data.managerEmail) ?? null) : null,
    ])
  )
  const loops = managerLoops(
    links,
    imported.map(r => r.data.externalId)
  )
  return found.map(row => {
    if (!row.data || !loops.has(row.data.externalId) || row.isSkipped || row.isRemoved) return row
    return dropManager({ ...row, data: row.data }, 'MANAGER_CYCLE', row.data.managerEmail ?? '')
  })
}
