import * as z from 'zod'

import {
  courseCodeSchema,
  entityId,
  externalIdSchema,
  isoDate,
  money,
  optionalText,
} from './fields'

export const completionSchema = z
  .object({
    externalId: externalIdSchema,
    employeeExternalId: externalIdSchema,
    courseCode: courseCodeSchema,
    completedOn: isoDate,
    validUntil: isoDate.nullable(),
    provider: optionalText(200),
    price: money,
    note: optionalText(2000),
  })
  .refine(c => c.validUntil === null || c.validUntil >= c.completedOn, {
    path: ['validUntil'],
    error: 'before_completed',
  })
export type CompletionInput = z.infer<typeof completionSchema>

/**
 * A completion as the form records or corrects it. The provider is picked (`providerId`) or
 * named as a new one (`newProviderName`), never both: a name is never matched to a provider
 * silently. An empty validity is worked out from the course.
 */
export const completionEditSchema = z
  .object({
    employeeId: entityId,
    courseId: entityId,
    completedOn: isoDate,
    validUntil: isoDate.nullable(),
    providerId: entityId.nullable(),
    newProviderName: optionalText(200),
    price: money,
    note: optionalText(2000),
  })
  .refine(c => c.validUntil === null || c.validUntil >= c.completedOn, {
    path: ['validUntil'],
    error: 'before_completed',
  })
  .refine(c => c.providerId === null || c.newProviderName === null, {
    path: ['newProviderName'],
    error: 'provider_both',
  })
export type CompletionEdit = z.infer<typeof completionEditSchema>
