import { itemsToBook, planAssignments } from '@muni/domain/advisor'

import type { Db } from '../src/client'
import { getAdvisorInput } from '../src/repositories'

/**
 * People who need a session's course booked now (as every booking is checked: required of
 * them, and not held), the most overdue first: whom a test can book on it. With `count`, that
 * many (it throws when there are fewer); else all of them.
 */
export async function needing(
  db: Db,
  sessionExternalId: string,
  options: { asOf?: string; now?: Date },
  count?: number
): Promise<string[]> {
  const session = await db.courseSession.findFirstOrThrow({
    where: { externalId: sessionExternalId },
    select: { course: { select: { code: true } } },
  })
  const plan = planAssignments(await getAdvisorInput({ db, ...options }))
  const people = itemsToBook(plan, { course: session.course.code }).map(
    i => i.need.employee.externalId
  )
  if (count === undefined) return people
  if (people.length < count)
    throw new Error(`fixture: ${String(count)} people who need ${session.course.code}`)
  return people.slice(0, count)
}
