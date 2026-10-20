import type { CourseInput, EmployeeInput } from '@muni/domain/schemas'

import type { ParsedRow, ReferenceSnapshot } from '../types'
import { Canonicalizer, DEPARTMENT_ALIASES } from './canonical'
import { creations, usable } from './shared'

/**
 * The departments and positions a batch names, shared by employees and course requirements:
 * one spelling per name (the register's, else the batch's most common), whether a name is one
 * people belong to (the register's, or an employee row's), and the ones the import creates.
 */
export function organisationOf(
  employees: readonly ParsedRow<EmployeeInput>[],
  courses: readonly ParsedRow<CourseInput>[],
  reference: ReferenceSnapshot
) {
  const people = employees.filter(usable).map(r => r.base.data)
  const requirements = courses.filter(usable).flatMap(r => r.base.data.requirements)
  const ofPeople = (pick: (e: EmployeeInput) => string | null) =>
    people.flatMap(e => {
      const value = pick(e)
      return value ? [value] : []
    })

  const departments = new Canonicalizer(
    [
      ...ofPeople(e => e.department),
      ...requirements.flatMap(r => (r.scope === 'DEPARTMENT' ? [r.department] : [])),
    ],
    reference.departments,
    DEPARTMENT_ALIASES
  )
  const positions = new Canonicalizer(
    [
      ...ofPeople(e => e.position),
      ...requirements.flatMap(r => (r.scope === 'POSITION' ? [r.position] : [])),
    ],
    reference.positions
  )
  // Names someone belongs to: a requirement naming anything else reaches nobody.
  const staffed = (canonicalizer: Canonicalizer, values: string[], existing: string[]) => {
    const keys = new Set([...values, ...existing].map(v => canonicalizer.keyOf(v)))
    return (value: string) => keys.has(canonicalizer.keyOf(value))
  }
  return {
    departments,
    positions,
    isStaffedDepartment: staffed(
      departments,
      ofPeople(e => e.department),
      reference.departments
    ),
    isStaffedPosition: staffed(
      positions,
      ofPeople(e => e.position),
      reference.positions
    ),
    newDepartment: creations(reference.departments, v => departments.keyOf(v)),
    newPosition: creations(reference.positions, v => positions.keyOf(v)),
  }
}

export type Organisation = ReturnType<typeof organisationOf>
