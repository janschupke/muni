import { type CompletionInput, completionSchema } from '@muni/domain/schemas'
import type { IsoDate } from '@muni/utils/dates'

import type { RowMapResult } from '../types'
import { reservedId, type RowBuilder } from './fields'

export function mapCompletion(
  b: RowBuilder,
  ctx: { today: IsoDate }
): RowMapResult<CompletionInput> {
  if (b.isSummaryRow('externalId')) return b.rejectSummary()

  const externalId = reservedId(b, b.required('externalId')?.toUpperCase() ?? null, 'completion')
  const employeeExternalId = b.required('employeeExternalId')?.toUpperCase() ?? null
  const courseCode = b.code('courseCode')
  const completedOn = b.date('completedOn', { required: true })
  let validUntil = b.date('validUntil', { required: false })
  // The completion is real; only its expiry is wrong: worked out from the course instead, as a
  // missing one is (validateCompletions).
  if (completedOn !== null && validUntil !== null && validUntil < completedOn) {
    b.warn('validUntil', 'VALIDITY_BEFORE_COMPLETION', { raw: b.cell('validUntil') })
    validUntil = null
  }
  // A training that has not happened yet is not a completion.
  if (completedOn !== null && completedOn > ctx.today) {
    b.error('completedOn', 'FUTURE_COMPLETION', { value: completedOn })
  }

  return b.finish(completionSchema, {
    externalId,
    employeeExternalId,
    courseCode,
    completedOn,
    validUntil,
    provider: b.optional('provider'),
    price: b.price('price'),
    note: b.text('note'),
  })
}
