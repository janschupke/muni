import { type CompletionInput } from '@muni/domain/schemas'
import { isoDateToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive'
import type { CommitResult } from './shared'
import { archivedOnly, courseIds, lookup, partition, upsertNames, withoutArchived } from './shared'

export async function writeCompletions(tx: Tx, all: CompletionInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'courseCompletion',
        'externalId',
        all.map(r => r.externalId)
      ),
      r => [r.externalId],
    ],
    [
      await archivedOnly(
        tx,
        'employee',
        'externalId',
        all.map(r => r.employeeExternalId)
      ),
      r => [r.employeeExternalId],
    ],
    [
      await archivedOnly(
        tx,
        'course',
        'code',
        all.map(r => r.courseCode)
      ),
      r => [r.courseCode],
    ],
    [
      await archivedOnly(
        tx,
        'provider',
        'name',
        all.map(r => r.provider)
      ),
      r => [r.provider],
    ],
  ])
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  const employees = new Map(
    (
      await tx.employee.findMany({
        where: {
          externalId: { in: [...new Set(records.map(r => r.employeeExternalId))] },
          ...ACTIVE,
        },
        select: { id: true, externalId: true },
      })
    ).map(e => [e.externalId, e.id])
  )
  const providers = await upsertNames(
    tx,
    'provider',
    records.flatMap(r => (r.provider ? [r.provider] : []))
  )
  const toData = (r: CompletionInput) => ({
    employeeId: lookup(employees, r.employeeExternalId, 'employee'),
    courseId: lookup(courses, r.courseCode, 'course'),
    completedOn: isoDateToUtc(r.completedOn),
    validUntil: r.validUntil ? isoDateToUtc(r.validUntil) : null,
    providerId: r.provider ? (providers.get(r.provider) ?? null) : null,
    price: r.price,
    note: cleanFreeText(r.note),
  })
  const { fresh, existing } = await partition(
    records,
    r => r.externalId,
    async keys =>
      (
        await tx.courseCompletion.findMany({
          where: { externalId: { in: keys }, ...ACTIVE },
          select: { id: true, externalId: true },
        })
      ).map(e => ({ key: e.externalId, id: e.id }))
  )
  await tx.courseCompletion.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r) })),
  })
  for (const { record, id } of existing)
    await tx.courseCompletion.update({ where: { id }, data: toData(record) })
  return { created: fresh.length, updated: existing.length, skipped }
}
