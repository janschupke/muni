import { type CompletionInput } from '@muni/domain/schemas'
import { isoDateToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive/archive'
import { chooseDefaultProvider } from '../repositories/catalog/default-provider'
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
  await offerWhatWasDelivered(tx, records.map(toData))
  await ensureDefaultProvider(tx)
  return { created: fresh.length, updated: existing.length, skipped }
}

/**
 * A provider that delivered a course offers it: each (provider, course) pair with no offering
 * yet gets one, at the pair's latest price in these records (0 without one). An offering the
 * app (or an earlier import) set is never changed.
 */
async function offerWhatWasDelivered(
  tx: Tx,
  rows: { providerId: string | null; courseId: string; completedOn: Date; price: number | null }[]
): Promise<void> {
  // Per pair, the latest priced completion; a pair never priced is offered at 0.
  const latest = new Map<
    string,
    { providerId: string; courseId: string; on: Date; price: number | null }
  >()
  for (const r of rows) {
    if (r.providerId === null) continue
    const key = `${r.providerId}|${r.courseId}`
    const seen = latest.get(key)
    const later = !seen || r.completedOn > seen.on
    const better = !seen || (r.price !== null && (seen.price === null || later))
    if (better && (r.price !== null || later))
      latest.set(key, {
        providerId: r.providerId,
        courseId: r.courseId,
        on: r.completedOn,
        price: r.price,
      })
  }
  await tx.providerCourse.createMany({
    data: [...latest.values()].map(o => ({
      providerId: o.providerId,
      courseId: o.courseId,
      pricePerPerson: o.price ?? 0,
    })),
    skipDuplicates: true,
  })
}

/**
 * With no default provider, one is chosen (`chooseDefaultProvider`): imported sessions that
 * name no provider go to it.
 */
async function ensureDefaultProvider(tx: Tx): Promise<void> {
  if (await tx.provider.findFirst({ where: { ...ACTIVE, isDefault: true }, select: { id: true } }))
    return
  const chosen = await chooseDefaultProvider(tx)
  if (chosen) await tx.provider.update({ where: { id: chosen }, data: { isDefault: true } })
}
