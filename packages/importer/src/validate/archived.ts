import type { CourseInput } from '@muni/domain/schemas'

import type { ArchivedKeys, ImportBatch, ParsedRow } from '../types'

/**
 * Every key in the batch that could name an archived record, for the server to check (it
 * answers with the ones only archived records hold). Names are sent as written; the server
 * compares them folded.
 */
export function archivedCandidates(batch: ImportBatch): ArchivedKeys {
  const keys = <T>(rows: ParsedRow<T>[] | undefined, pick: (data: T) => (string | null)[]) => [
    ...new Set(
      (rows ?? []).flatMap(r => (r.base.data ? pick(r.base.data) : [])).filter(v => v !== null)
    ),
  ]
  const union = (...lists: string[][]) => [...new Set(lists.flat())]
  const departmentsOf = (c: CourseInput) =>
    c.requirements.flatMap(q => (q.scope === 'DEPARTMENT' ? [q.department] : []))
  const positionsOf = (c: CourseInput) =>
    c.requirements.flatMap(q => (q.scope === 'POSITION' ? [q.position] : []))
  return {
    courses: union(
      keys(batch.courses, c => [c.code]),
      keys(batch.sessions, s => [s.courseCode]),
      keys(batch.completions, c => [c.courseCode])
    ),
    employees: union(
      keys(batch.employees, e => [e.externalId]),
      keys(batch.completions, c => [c.employeeExternalId])
    ),
    employeeEmails: keys(batch.employees, e => [e.managerEmail]),
    departments: union(
      keys(batch.employees, e => [e.department]),
      keys(batch.courses, departmentsOf)
    ),
    positions: union(
      keys(batch.employees, e => [e.position]),
      keys(batch.courses, positionsOf)
    ),
    providers: keys(batch.completions, c => [c.provider]),
    rooms: union(
      keys(batch.rooms, r => [r.name]),
      keys(batch.sessions, s => [s.location])
    ),
    sessions: keys(batch.sessions, s => [s.externalId]),
    completions: keys(batch.completions, c => [c.externalId]),
  }
}
