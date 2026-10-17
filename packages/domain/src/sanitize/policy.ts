import * as z from 'zod'

import { type Role, ROLES } from '../enums'
import { defaultPolicy } from './sanitize.config'

/** Every sensitive field, as `<entity>.<field>`. Adding a field here forces a policy entry. */
export const SENSITIVE_FIELDS = {
  employee: ['nationalId', 'email', 'note'],
  completion: ['note', 'price'],
} as const

export type SensitiveEntity = keyof typeof SENSITIVE_FIELDS
export type SensitiveFieldOf<E extends SensitiveEntity> = (typeof SENSITIVE_FIELDS)[E][number]
export type SensitiveField = {
  [E in SensitiveEntity]: `${E}.${SensitiveFieldOf<E>}`
}[SensitiveEntity]

const ruleSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('show') }),
  z.object({ mode: z.literal('omit') }),
  /** Text only: keeps `keepFirst`/`keepLast` characters, stars the rest. */
  z.object({
    mode: z.literal('mask'),
    keepFirst: z.int().min(0).max(8).optional(),
    keepLast: z.int().min(0).max(8).optional(),
  }),
  /** Text only: `tereza.urbanova@vzorova.example` → `t•••••@vzorova.example`. */
  z.object({ mode: z.literal('maskEmail') }),
])
export type FieldRule = z.infer<typeof ruleSchema>

/** One rule per role. */
const fieldPolicySchema = z.object({ VIEWER: ruleSchema, FULL: ruleSchema, ADMIN: ruleSchema })
export type FieldPolicy = z.infer<typeof fieldPolicySchema>

const ALL_FIELDS = Object.entries(SENSITIVE_FIELDS).flatMap(([entity, fields]) =>
  fields.map(field => `${entity}.${field}` as SensitiveField)
)

export type SanitizePolicy = Record<SensitiveField, FieldPolicy>

const policySchema = z.object(
  Object.fromEntries(ALL_FIELDS.map(field => [field, fieldPolicySchema])) as Record<
    SensitiveField,
    typeof fieldPolicySchema
  >
)

/** Numeric fields can only be shown or omitted; masking a number has no meaning. */
const NUMERIC_FIELDS = new Set<SensitiveField>(['completion.price'])

const overrideSchema = z
  .record(
    z.string(),
    z
      .object({
        VIEWER: ruleSchema.optional(),
        FULL: ruleSchema.optional(),
        // Admins edit these fields, so their forms read them whole: anything but `show`
        // could not hold, and an override that pretends otherwise is refused.
        ADMIN: z.object({ mode: z.literal('show') }).optional(),
      })
      .strict()
  )
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!ALL_FIELDS.includes(key as SensitiveField)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Unknown sensitive field "${key}"` })
      }
    }
  })

export class SanitizePolicyError extends Error {
  override name = 'SanitizePolicyError'
}

/**
 * Builds the effective policy: the default config with an optional JSON override merged
 * per field and per role. Throws on unknown fields, unknown modes, masking a number or
 * restricting admins (who edit these fields), so a bad override fails on first use rather
 * than leaking data or promising what it cannot hold.
 */
export function loadPolicy(overrideJson?: string | null): SanitizePolicy {
  const merged: SanitizePolicy = structuredClone(defaultPolicy)

  if (overrideJson != null && overrideJson.trim() !== '') {
    let raw: unknown
    try {
      raw = JSON.parse(overrideJson)
    } catch {
      throw new SanitizePolicyError('MUNI_SANITIZE_POLICY is not valid JSON')
    }
    const parsed = overrideSchema.safeParse(raw)
    if (!parsed.success) {
      throw new SanitizePolicyError(`MUNI_SANITIZE_POLICY: ${z.prettifyError(parsed.error)}`)
    }
    for (const [field, rules] of Object.entries(parsed.data)) {
      const key = field as SensitiveField
      merged[key] = {
        VIEWER: rules.VIEWER ?? merged[key].VIEWER,
        FULL: rules.FULL ?? merged[key].FULL,
        ADMIN: rules.ADMIN ?? merged[key].ADMIN,
      }
    }
  }

  const final = policySchema.parse(merged)
  for (const field of NUMERIC_FIELDS) {
    for (const rule of ROLES.map(role => final[field][role])) {
      if (rule.mode === 'mask' || rule.mode === 'maskEmail') {
        throw new SanitizePolicyError(`${field} is numeric and can only be "show" or "omit"`)
      }
    }
  }
  return final
}

const MASK_CHAR = '•'

export function maskText(value: string, keepFirst = 0, keepLast = 0): string {
  const chars = Array.from(value)
  if (keepFirst + keepLast >= chars.length) return MASK_CHAR.repeat(chars.length)
  const head = chars.slice(0, keepFirst).join('')
  const tail = keepLast > 0 ? chars.slice(-keepLast).join('') : ''
  return head + MASK_CHAR.repeat(chars.length - keepFirst - keepLast) + tail
}

export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@')
  if (at <= 0) return maskText(value)
  return maskText(value.slice(0, at), 1) + value.slice(at)
}

type Sanitizable = string | number | null

function applyRule(rule: FieldRule, value: Sanitizable): Sanitizable | undefined {
  if (value === null) return rule.mode === 'omit' ? undefined : null
  switch (rule.mode) {
    case 'show':
      return value
    case 'omit':
      return undefined
    case 'mask':
      return maskText(String(value), rule.keepFirst, rule.keepLast)
    case 'maskEmail':
      return maskEmail(String(value))
  }
}

/** The record with its sensitive fields possibly masked (same type) or removed (`undefined`). */
export type Sanitized<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] }

/**
 * Applies the policy to one record. Omitted fields are deleted, not set to undefined,
 * so they never appear in serialised output (RSC payloads, JSON).
 */
export function sanitizeRecord<
  E extends SensitiveEntity,
  T extends Record<SensitiveFieldOf<E>, Sanitizable>,
>(policy: SanitizePolicy, entity: E, record: T, role: Role): Sanitized<T, SensitiveFieldOf<E>> {
  const sensitive = new Set<string>(SENSITIVE_FIELDS[entity])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (!sensitive.has(key)) {
      out[key] = value
      continue
    }
    const rule = policy[`${entity}.${key}` as SensitiveField][role]
    const next = applyRule(rule, value as Sanitizable)
    if (next !== undefined) out[key] = next
  }
  return out as Sanitized<T, SensitiveFieldOf<E>>
}

/** Whether a role sees the field at all (shown or masked), so the UI can drop its column. */
export function isVisible(policy: SanitizePolicy, field: SensitiveField, role: Role): boolean {
  return policy[field][role].mode !== 'omit'
}
