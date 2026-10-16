import type * as z from 'zod'

/** What a form action returns when it does not redirect. Errors are i18n keys under forms.errors. */
export type FormState =
  { status: 'idle' } | { status: 'error'; fieldErrors: Record<string, string>; formError?: string }

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

const KNOWN = new Set([
  'invalid_type',
  'invalid_format',
  'too_small',
  'too_big',
  'before_start',
  'before_hired',
  'before_completed',
])

/**
 * zod issues → { field: i18n key }. Custom refinements carry their key as the message.
 * `input` is the object that was parsed: zod 4 does not echo input values in issues, so an
 * empty (null) field is recognised from it and reported as "required".
 */
export function fieldErrors(error: z.ZodError, input: Record<string, unknown>): FormState {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form')
    if (field in fieldErrors) continue
    const isMissing = issue.code === 'invalid_type' && input[field] == null
    const key = isMissing ? 'required' : issue.code === 'custom' ? issue.message : issue.code
    fieldErrors[field] = KNOWN.has(key) || key === 'required' ? key : 'invalid_format'
  }
  return { status: 'error', fieldErrors }
}

export function formError(key: 'not_found' | 'generic' | 'in_use'): FormState {
  return { status: 'error', fieldErrors: {}, formError: key }
}
