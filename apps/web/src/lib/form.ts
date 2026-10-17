import type { ArchiveRefusal, SessionProblem, UniqueField } from '@muni/db/repositories'
import { parseCzk } from '@muni/utils/money'
import type * as z from 'zod'

/** What a field can be wrong with: i18n keys under forms.errors. */
export type FieldErrorKey =
  | 'required'
  | 'invalid_type'
  | 'invalid_format'
  | 'invalid_email'
  | 'invalid_url'
  | 'invalid_date'
  | 'invalid_time'
  | 'invalid_phone'
  | 'invalid_national_id'
  | 'invalid_code'
  | 'not_a_number'
  | 'too_small'
  | 'too_big'
  | 'too_small_number'
  | 'too_big_number'
  | 'too_long'
  | 'before_start'
  | 'in_past'
  | 'before_hired'
  | 'before_completed'
  | 'duplicate'
  | 'taken'
  | 'room_busy'
  | 'room_online_not_allowed'
  | 'room_too_small'
  | 'room_missing_capabilities'
  | 'room_archived'
  | 'course_archived'
  | 'company_id'
  | 'unavailable'
  | 'manager_cycle'
  | 'own_role'
  | 'last_admin'
  | 'over_capacity'
  | 'attendee_conflict'
  | 'sessions_unfit'
  | 'not_a_member'
  | 'pair_unknown'
  | 'provider_both'
  | 'no_department'
  | 'in_use'
  | 'below_booked'
  | 'room_too_small_live'
  | 'room_missing_live'
  | 'position_not_in_department'

/** What can go wrong with the whole form: i18n keys under forms.errors. */
export type FormErrorKey = 'not_found' | 'generic' | 'unauthorized' | 'rate_limited'

/** What a form action returns: saved (and where to go next), or what is wrong. */
export type FormState =
  | { status: 'idle' }
  | { status: 'saved'; href: string }
  | {
      status: 'error'
      fieldErrors: Partial<Record<string, FieldErrorKey>>
      /** What a field's message says besides its key (how many sessions, …). */
      values?: Partial<Record<string, Record<string, number>>> | undefined
      formError?: FormErrorKey
    }

export const IDLE: FormState = { status: 'idle' }

/** The completion form's provider picker posts this for "a new provider, named below". */
export const NEW_PROVIDER = 'new'

/** Why an archive or unarchive did not happen: i18n keys under archive.refused. */
type ArchiveRefusalKey =
  | Lowercase<Exclude<ArchiveRefusal, 'NOT_FOUND'>>
  | 'not_found'
  | 'taken'
  | 'parent_archived'
  | 'room_busy'
  | 'room_unfit'
  | 'unauthorized'
  | 'rate_limited'
  | 'generic'

/**
 * What an archive or unarchive action returns: done (and where to go next, if the page is
 * left), or why not (with how many things are in the way, or which unique fields are taken).
 */
export type ArchiveState =
  | { status: 'idle' }
  | { status: 'done'; href?: string | undefined }
  | {
      status: 'refused'
      reason: ArchiveRefusalKey
      count?: number | undefined
      fields?: UniqueField[] | undefined
    }

export const ARCHIVE_IDLE: ArchiveState = { status: 'idle' }

/** An archive refusal from the database, as the state the page shows. */
export function archiveRefused(reason: ArchiveRefusal, count: number): ArchiveState {
  return {
    status: 'refused',
    reason: reason === 'NOT_FOUND' ? 'not_found' : (reason.toLowerCase() as ArchiveRefusalKey),
    count,
  }
}

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

/**
 * An amount in crowns, read as the imports read it (`1 200,50 Kč`, `450,-`, `zdarma`); empty
 * → null. A negative amount reaches the schema as a number, so it says the value is too small;
 * anything else unreadable is passed through for the schema to reject.
 */
export function money(form: FormData, key: string): number | string | null {
  const value = text(form, key)
  if (value === null) return null
  const parsed = parseCzk(value)
  if (parsed.ok) return parsed.value
  return parsed.reason === 'negative' ? number(form, key) : value
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
  'in_past',
  'before_hired',
  'before_completed',
  'duplicate',
  'company_id',
  'over_capacity',
  'provider_both',
  'no_department',
] satisfies FieldErrorKey[])

/** What a format check was for, by the check (`z.email()`, …). */
const FORMATS: Partial<Record<string, FieldErrorKey>> = {
  email: 'invalid_email',
  url: 'invalid_url',
  date: 'invalid_date',
}

/** What a pattern (regex) check was for, by the field it ran on. */
const PATTERNS: Partial<Record<string, FieldErrorKey>> = {
  phone: 'invalid_phone',
  nationalId: 'invalid_national_id',
  code: 'invalid_code',
  startTime: 'invalid_time',
  endTime: 'invalid_time',
}

/** One zod issue as a message key, with what the message counts (a minimum, a length). */
function keyOf(
  issue: z.core.$ZodIssue,
  field: string,
  input: Record<string, unknown>
): { key: FieldErrorKey; values?: Record<string, number> } {
  switch (issue.code) {
    case 'invalid_type':
      if (input[field] == null) return { key: 'required' }
      // A number field posts what was typed when it is not a number (`number()`).
      return { key: issue.expected === 'number' ? 'not_a_number' : 'invalid_type' }
    case 'invalid_format':
      return {
        key:
          (issue.format === 'regex' ? PATTERNS[field] : FORMATS[issue.format]) ?? 'invalid_format',
      }
    case 'too_small':
      return issue.origin === 'number'
        ? { key: 'too_small_number', values: { min: Number(issue.minimum) } }
        : { key: 'too_small' }
    case 'too_big':
      if (issue.origin === 'number')
        return { key: 'too_big_number', values: { max: Number(issue.maximum) } }
      if (issue.origin === 'string')
        return { key: 'too_long', values: { max: Number(issue.maximum) } }
      return { key: 'too_big' }
    case 'custom':
      return {
        key:
          KNOWN.has(issue.message) || issue.message === 'required'
            ? (issue.message as FieldErrorKey)
            : 'invalid_format',
      }
    default:
      return { key: KNOWN.has(issue.code) ? (issue.code as FieldErrorKey) : 'invalid_format' }
  }
}

/**
 * zod issues → { field: i18n key }, the first issue of each field. Custom refinements carry
 * their key as the message. `input` is the object that was parsed: zod 4 does not echo input
 * values in issues, so an empty (null) field is recognised from it and reported as
 * "required". The browser runs this on every change, the server on every save.
 */
export function fieldErrors(error: z.ZodError, input: Record<string, unknown>): FormState {
  const fieldErrors: Record<string, FieldErrorKey> = {}
  const values: Record<string, Record<string, number>> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form')
    if (field in fieldErrors) continue
    const found = keyOf(issue, field, input)
    fieldErrors[field] = found.key
    if (found.values) values[field] = found.values
  }
  return { status: 'error', fieldErrors, ...(Object.keys(values).length > 0 && { values }) }
}

export function formError(key: FormErrorKey): FormState {
  return { status: 'error', fieldErrors: {}, formError: key }
}

const PROBLEM_FIELD: Partial<Record<SessionProblem, string>> = {
  ROOM_TOO_SMALL: 'capacity',
  OVER_CAPACITY: 'capacity',
  COURSE_ARCHIVED: 'courseId',
  ATTENDEE_CONFLICT: 'startTime',
}

/** A session the room cannot take: the reason goes on the field to change. */
export function sessionProblem(problem: SessionProblem): FormState {
  return {
    status: 'error',
    fieldErrors: {
      [PROBLEM_FIELD[problem] ?? 'roomId']: problem.toLowerCase() as Lowercase<SessionProblem>,
    },
  }
}

/** One field refused by the database, with what its message counts. */
export function refusedField(
  field: string,
  key: FieldErrorKey,
  values?: Record<string, number>
): FormState {
  return {
    status: 'error',
    fieldErrors: { [field]: key },
    ...(values && { values: { [field]: values } }),
  }
}
