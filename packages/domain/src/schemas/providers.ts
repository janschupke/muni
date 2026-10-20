import { isCompanyId } from '@muni/utils/text'
import * as z from 'zod'

import { optionalText, trimmed } from './fields'

/** Who delivers training; only the name is required. */
export const providerSchema = z.object({
  name: trimmed(200),
  /** IČO, written with or without spaces. */
  companyId: z
    .string()
    .transform(v => v.replace(/\s/g, ''))
    .refine(isCompanyId, { error: 'company_id' })
    .nullable(),
  email: z.email().max(254).nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()/-]{6,30}$/)
    .nullable(),
  /** A bare domain (`www.example.cz`) is read as https. */
  website: z
    .string()
    .trim()
    .transform(v => (/^[a-z][a-z\d+.-]*:/i.test(v) ? v : `https://${v}`))
    .pipe(z.url({ protocol: /^https?$/ }).max(500))
    .nullable(),
  note: optionalText(2000),
})
export type ProviderInput = z.infer<typeof providerSchema>

/** A course a provider offers, at its price per person (0 for internal training). */
const offeringSchema = z.object({
  courseId: z.string().trim().min(1).max(64),
  price: z.number().min(0).max(1_000_000).multipleOf(0.01),
})
export type OfferingInput = z.infer<typeof offeringSchema>

/**
 * The provider form: the record, whether it holds imported sessions that name no provider,
 * and the courses it offers (each course once).
 */
export const providerEditSchema = providerSchema.extend({
  isDefault: z.boolean(),
  offerings: z
    .array(offeringSchema)
    .max(500)
    .superRefine((rows, ctx) => {
      const seen = new Set<string>()
      rows.forEach((row, i) => {
        if (seen.has(row.courseId))
          ctx.addIssue({ code: 'custom', path: [i, 'courseId'], message: 'duplicate' })
        seen.add(row.courseId)
      })
    }),
})
export type ProviderEdit = z.infer<typeof providerEditSchema>
