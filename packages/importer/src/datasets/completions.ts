import { type CompletionInput, completionSchema } from '@muni/domain/schemas'
import type { IsoDate } from '@muni/utils/dates'

import { reservedId, type RowBuilder } from '../fields'
import type { RowMapResult } from '../types'

export function mapCompletion(
  b: RowBuilder,
  ctx: { today: IsoDate }
): RowMapResult<CompletionInput> {
  if (b.isSummaryRow('externalId')) return b.rejectSummary()

  const externalId = reservedId(b, b.required('externalId')?.toUpperCase() ?? null, 'completion')
  const employeeExternalId = b.required('employeeExternalId')?.toUpperCase() ?? null
  const courseCode = b.code('courseCode')
  const completedOn = b.date('completedOn', { required: true })
  const validUntil = b.date('validUntil', { required: false })
  if (completedOn !== null && validUntil !== null && validUntil < completedOn) {
    b.error('validUntil', 'VALIDITY_BEFORE_COMPLETION', { raw: b.cell('validUntil') })
  }
  if (completedOn !== null && completedOn > ctx.today) {
    b.warn('completedOn', 'FUTURE_COMPLETION', { value: completedOn })
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
