import type { ImportBatch, ReferenceSnapshot } from '../types'
import { validateCompletions } from './completions'
import { validateCourses } from './courses'
import { validateEmployees } from './employees'
import { organisationOf } from './organisation'
import { validateRooms } from './rooms'
import { validateSessions } from './sessions'
import { archivedChecks } from './shared'

export { archivedCandidates } from './archived'

/**
 * Cross-row and cross-file validation. Pure: every call recomputes from each row's `base`, so
 * stale cross-row issues never survive an edit. In commit order, each stage reading what the
 * ones before it will write: courses and people (the departments and positions they name
 * together), rooms, completions (they make providers and offerings), then sessions.
 */
export function validateBatch(batch: ImportBatch, reference: ReferenceSnapshot): ImportBatch {
  const archived = archivedChecks(reference)
  const organisation = organisationOf(batch.employees ?? [], batch.courses ?? [], reference)
  const courses = validateCourses(batch.courses ?? [], { archived, organisation, reference })
  const people = validateEmployees(batch.employees ?? [], { archived, organisation, reference })
  const rooms = validateRooms(batch.rooms ?? [], { archived, reference })
  const completions = validateCompletions(batch.completions ?? [], {
    archived,
    reference,
    people,
    validity: courses.validity,
  })
  const sessions = validateSessions(batch.sessions ?? [], {
    archived,
    reference,
    validity: courses.validity,
    rooms,
    completions,
  })
  return {
    courses: courses.rows,
    employees: people.rows,
    rooms,
    completions,
    sessions,
  }
}
