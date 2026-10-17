import type { CompletionEdit } from '@muni/domain/schemas'

import type { Db } from '../src/client'

/**
 * A completion as the form posts it, from the codes and names a test knows: the person's and
 * course's ids, and the provider picked by name (an active one) or, with `newProvider`, named
 * as a new one.
 */
export async function completionOf(
  db: Db,
  given: {
    employee: string
    course: string
    completedOn: string
    validUntil?: string | null
    provider?: string | null
    newProvider?: string | null
    price?: number | null
  }
): Promise<CompletionEdit> {
  const active = { archivedAt: null }
  const employee = await db.employee.findFirstOrThrow({
    where: { externalId: given.employee, ...active },
  })
  const course = await db.course.findFirstOrThrow({ where: { code: given.course, ...active } })
  const provider = given.provider
    ? await db.provider.findFirstOrThrow({ where: { name: given.provider, ...active } })
    : null
  return {
    employeeId: employee.id,
    courseId: course.id,
    completedOn: given.completedOn,
    validUntil: given.validUntil ?? null,
    providerId: provider?.id ?? null,
    newProviderName: given.newProvider ?? null,
    price: given.price ?? null,
    note: null,
  }
}

/** A course's id by its code (an active course). */
export async function courseIdOf(db: Db, code: string): Promise<string> {
  return (await db.course.findFirstOrThrow({ where: { code, archivedAt: null } })).id
}
