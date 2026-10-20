import * as z from 'zod'

import { CAPABILITIES } from '../enums'

// The field shapes every record's schema is built from.

export const isoDate = z.iso.date()
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const trimmed = (max: number) => z.string().trim().min(1).max(max)
export const optionalText = (max: number) => z.string().trim().max(max).nullable()
export const money = z.number().min(0).max(1_000_000).nullable()

export const courseCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/)
  .max(32)

export const externalIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]\d{3,8}$/)

/**
 * ID prefixes for records created in the app. Imports refuse them, so a source export can
 * never overwrite something entered here.
 */
export const APP_ID_PREFIX = { session: 'S', completion: 'A', employee: 'N' } as const

export const capabilities = z
  .array(z.enum(CAPABILITIES))
  .refine(list => new Set(list).size === list.length, { error: 'duplicate' })

/** A record's internal id, as a form posts it (a select's value). */
export const entityId = z.string().trim().min(1).max(64)
export const entityIds = z
  .array(entityId)
  .max(500)
  .refine(ids => new Set(ids).size === ids.length, { error: 'duplicate' })
