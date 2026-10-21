import { type CompletionInput } from '@muni/domain/schemas'
import { isoDateToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive/archive'
import { chooseDefaultProvider } from '../repositories/catalog/default-provider'
import { toAmount } from '../repositories/core/context'
import type { CommitResult } from './shared'
import {
  archivedOnly,
  courseIds,
  differs,
  lookup,
  partition,
  upsertNames,
  withoutArchived,
} from './shared'

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
          select: {
            id: true,
            externalId: true,
            employeeId: true,
            courseId: true,
            completedOn: true,
            validUntil: true,
            providerId: true,
            price: true,
            note: true,
          },
        })
      ).map(held => ({ key: held.externalId, held }))
  )
  await tx.courseCompletion.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r) })),
  })
  const changed = existing
    .map(({ record, held }) => ({ id: held.id, held, data: toData(record) }))
    .filter(({ held, data }) => differs(held, data))
  for (const { id, data } of changed) await tx.courseCompletion.update({ where: { id }, data })
  return {
    created: fresh.length,
    updated: changed.length,
    unchanged: existing.length - changed.length,
    skipped,
  }
}

/**
 * A provider that delivered a course offers it: each (provider, course) pair the register's
 * completions show with no offering yet gets one, at the latest price paid for it (0 when none
 * ever was). An offering the app (or an earlier import) set is never changed. Run once a
 * completions import is all written: from one chunk, "latest" would be that chunk's.
 */
export async function offerWhatWasDelivered(tx: Tx): Promise<void> {
  const delivered = await tx.courseCompletion.findMany({
    where: { ...ACTIVE, providerId: { not: null }, provider: ACTIVE, course: ACTIVE },
    select: { providerId: true, courseId: true, price: true },
    orderBy: [{ completedOn: 'asc' }, { externalId: 'asc' }],
  })
  const offers = new Map<string, { providerId: string; courseId: string; price: number }>()
  for (const d of delivered) {
    if (d.providerId === null) continue
    const key = `${d.providerId}|${d.courseId}`
    const price = d.price === null ? (offers.get(key)?.price ?? 0) : toAmount(d.price)
    offers.set(key, { providerId: d.providerId, courseId: d.courseId, price })
  }
  await tx.providerCourse.createMany({
    data: [...offers.values()].map(o => ({
      providerId: o.providerId,
      courseId: o.courseId,
      pricePerPerson: o.price,
    })),
    skipDuplicates: true,
  })
}

/**
 * With no default provider, one is chosen (`chooseDefaultProvider`): imported sessions that
 * name no provider go to it. Run once a completions import is all written, so the choice
 * counts every completion, not the first chunk's.
 */
export async function ensureDefaultProvider(tx: Tx): Promise<void> {
  if (await tx.provider.findFirst({ where: { ...ACTIVE, isDefault: true }, select: { id: true } }))
    return
  const chosen = await chooseDefaultProvider(tx)
  if (chosen) await tx.provider.update({ where: { id: chosen }, data: { isDefault: true } })
}
