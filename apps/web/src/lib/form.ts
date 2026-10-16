import type { SessionProblem } from '@muni/db/repositories'
import type * as z from 'zod'

/** What a field can be wrong with: i18n keys under forms.errors. */
export type FieldErrorKey =
  | 'required'
  | 'invalid_type'
  | 'invalid_format'
  | 'too_small'
  | 'too_big'
  | 'before_start'
  | 'before_hired'
  | 'before_completed'
  | 'duplicate'
  | 'taken'
  | 'room_busy'
  | 'room_online_not_allowed'
  | 'room_too_small'
  | 'room_missing_capabilities'

/** What can go wrong with the whole form: i18n keys under forms.errors. */
export type FormErrorKey = 'not_found' | 'generic' | 'in_use'

/** What a form action returns when it does not redirect. */
export type FormState =
  | { status: 'idle' }
  | {
      status: 'error'
      fieldErrors: Partial<Record<string, FieldErrorKey>>
      formError?: FormErrorKey
    }

export const IDLE: FormState = { status: 'idle' }

/** Trimmed text; empty → null. */
export function text(form: FormData, key: string): string | null {
  const value = form.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Number field; empty → null. Unparseable input is passed through so the schema rejects it. */
export function number(form: FormData, key: string): number | string | null {
  const value = text(form, key)
  if (value === null) return null
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : value
}

export function checkbox(form: FormData, key: string): boolean {
  return form.get(key) === 'on'
}

/** Every value posted under one name (a checkbox group). */
export function list(form: FormData, key: string): string[] {
  return form.getAll(key).filter(v => typeof v === 'string')
}

const KNOWN = new Set<string>([
  'invalid_type',
  'invalid_format',
  'too_small',
  'too_big',
  'before_start',
  'before_hired',
  'before_completed',
  'duplicate',
] satisfies FieldErrorKey[])

/**
 * zod issues → { field: i18n key }. Custom refinements carry their key as the message.
 * `input` is the object that was parsed: zod 4 does not echo input values in issues, so an
 * empty (null) field is recognised from it and reported as "required".
 */
export function fieldErrors(error: z.ZodError, input: Record<string, unknown>): FormState {
  const fieldErrors: Record<string, FieldErrorKey> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form')
    if (field in fieldErrors) continue
    const isMissing = issue.code === 'invalid_type' && input[field] == null
    const key = isMissing ? 'required' : issue.code === 'custom' ? issue.message : issue.code
    fieldErrors[field] =
      key === 'required' || KNOWN.has(key) ? (key as FieldErrorKey) : 'invalid_format'
  }
  return { status: 'error', fieldErrors }
}

export function formError(key: FormErrorKey): FormState {
  return { status: 'error', fieldErrors: {}, formError: key }
}

/** A session the room cannot take: the reason goes on the field to change. */
export function sessionProblem(problem: SessionProblem): FormState {
  const field = problem === 'ROOM_TOO_SMALL' ? 'capacity' : 'roomId'
  return {
    status: 'error',
    fieldErrors: { [field]: problem.toLowerCase() as Lowercase<SessionProblem> },
  }
}
