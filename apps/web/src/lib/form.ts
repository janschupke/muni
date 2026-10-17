import type { ArchiveRefusal, SessionProblem, UniqueField } from '@muni/db/repositories'
import { parseCzk } from '@muni/utils/money'
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
  | 'room_archived'
  | 'course_archived'
  | 'company_id'
  | 'unavailable'
  | 'manager_cycle'
  | 'own_role'
  | 'last_admin'
  | 'over_capacity'
  | 'sessions_unfit'
  | 'not_a_member'
  | 'pair_unknown'
  | 'provider_both'
  | 'no_department'
  | 'in_use'

/** What can go wrong with the whole form: i18n keys under forms.errors. */
export type FormErrorKey = 'not_found' | 'generic'

/** What a form action returns when it does not redirect. */
export type FormState =
  | { status: 'idle' }
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
  | 'generic'

/**
 * What an archive or unarchive action returns when it does not leave the page: done, or why
 * not (with how many things are in the way, or which unique fields are taken).
 */
export type ArchiveState =
  | { status: 'idle' }
  | { status: 'done' }
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
  'before_hired',
  'before_completed',
  'duplicate',
  'company_id',
  'over_capacity',
  'provider_both',
  'no_department',
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

const PROBLEM_FIELD: Partial<Record<SessionProblem, string>> = {
  ROOM_TOO_SMALL: 'capacity',
  OVER_CAPACITY: 'capacity',
  COURSE_ARCHIVED: 'courseId',
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
