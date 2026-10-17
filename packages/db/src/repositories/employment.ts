import { type EmploymentState, employmentState, type EmploymentStatus } from '@muni/domain/enums'
import { isoDateFromUtc, isoDateToUtc, todayIn } from '@muni/utils/dates'

// Whether someone has left is their leaving date reached, not a stored status: a person whose
// date is still ahead is at work (or on leave) until then, and counts until then.

/** People who have not left by `asOf`: no leaving date, or one still ahead. */
export const stillEmployed = (asOf: string = todayIn()) => ({
  OR: [{ leftOn: null }, { leftOn: { gt: isoDateToUtc(asOf) } }],
})

/** People who have left by `asOf`. */
export const hasLeft = (asOf: string = todayIn()) => ({ leftOn: { lte: isoDateToUtc(asOf) } })

/** Where a stored person stands on `asOf` (LEFT from their leaving date on). */
export function stateOf(
  person: { status: EmploymentStatus; leftOn: Date | null },
  asOf: string = todayIn()
): EmploymentState {
  return employmentState(person.status, person.leftOn && isoDateFromUtc(person.leftOn), asOf)
}

/** A list filter by state, as a where clause. */
export function stateWhere(state: EmploymentState, asOf: string = todayIn()) {
  return state === 'LEFT' ? hasLeft(asOf) : { status: state, ...stillEmployed(asOf) }
}
