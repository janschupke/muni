import { fold } from '@muni/utils/text'

import { type IssueCode, SKIPPING_CODES } from '../issues'
import type { ParsedRow, ReferenceSnapshot, Severity, ValidationIssue } from '../types'

/** The cross-row issues a stage adds to a row, on top of its row-level ones. */
export type Extra = ValidationIssue[]

export const issue = (
  field: string,
  code: IssueCode,
  severity: Severity,
  params?: ValidationIssue['params']
): ValidationIssue => ({ field, code, severity, ...(params && { params }) })

/** Recomputes the final state of a row from its row-level base plus cross-row issues. */
export function finalize<T>(row: ParsedRow<T>, data: T | null, extra: Extra): ParsedRow<T> {
  const issues = [...row.base.issues, ...extra]
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const isValid = row.base.data !== null && errors.length === 0
  const isSkipped = isValid && warnings.some(w => SKIPPING_CODES.includes(w.code))
  return { ...row, data: isValid ? data : null, errors, warnings, isValid, isSkipped }
}

/** Whether the row-level and cross-row issues so far include an error. */
export const hasError = (row: ParsedRow<unknown>, extra: Extra) =>
  [...row.base.issues, ...extra].some(i => i.severity === 'error')

/**
 * Keys only archived records hold, by kind. Names compare folded (as the canonicalizers do);
 * codes and IDs exactly.
 */
export function archivedChecks(reference: ReferenceSnapshot) {
  const a = reference.archived
  const folded = (values: string[]) => {
    const set = new Set(values.map(fold))
    return (value: string | null) => value !== null && set.has(fold(value))
  }
  const exact = (values: string[]) => {
    const set = new Set(values)
    return (value: string | null) => value !== null && set.has(value)
  }
  return {
    course: exact(a.courses),
    employee: exact(a.employees),
    employeeEmail: exact(a.employeeEmails),
    department: folded(a.departments),
    position: folded(a.positions),
    provider: folded(a.providers),
    room: folded(a.rooms),
    session: exact(a.sessions),
    completion: exact(a.completions),
  }
}

export type Archived = ReturnType<typeof archivedChecks>

export const archivedIssue = (field: string, value: string) =>
  issue(field, 'ARCHIVED', 'warning', { value })

/**
 * A reference to another record: one only an archived record holds is an `ARCHIVED` warning
 * (which skips the row), one nothing holds gets the `unknown` issue. True when it names a
 * record that is there, so the caller can go on to check it.
 */
export function checkRef(
  extra: Extra,
  field: string,
  value: string,
  {
    archived,
    known,
    unknown,
    hint,
  }: {
    archived: boolean
    known: boolean
    unknown: readonly [IssueCode, Severity]
    /** More for the unknown issue to say (a code it may have meant). */
    hint?: () => ValidationIssue['params']
  }
): boolean {
  if (archived) {
    extra.push(archivedIssue(field, value))
    return false
  }
  if (!known) {
    extra.push(issue(field, unknown[0], unknown[1], { value, ...hint?.() }))
    return false
  }
  return true
}

/** Whether `a` becomes `b` by one insertion, deletion or substitution. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const rest = (x: string, skip: number) => x.slice(i + skip)
  return (
    rest(a, 1) === rest(b, 1) || // substitution
    rest(a, 1) === rest(b, 0) || // a has one more
    rest(a, 0) === rest(b, 1) // b has one more
  )
}

/**
 * The code a mistyped one was meant to be (`KYB3R` → KYBER): the single known code one edit
 * away, or `'none'` when there is no such code or more than one.
 */
export function suggestedCode(code: string, known: Iterable<string>): { suggestion: string } {
  const near = [...known].filter(k => oneEditApart(code, k))
  return { suggestion: near.length === 1 && near[0] ? near[0] : 'none' }
}

/**
 * Announces each name the import will create a record for (a department, position or
 * provider the register does not have yet), once, on the first row that names it.
 */
export function creations(known: readonly string[], keyOf: (value: string) => string) {
  const existing = new Set(known.map(keyOf))
  const announced = new Set<string>()
  return (field: string, value: string | null): ValidationIssue[] => {
    if (value === null) return []
    const key = keyOf(value)
    if (existing.has(key) || announced.has(key)) return []
    announced.add(key)
    return [issue(field, 'WILL_CREATE', 'warning', { value })]
  }
}

/** Rows that can serve as a reference for other rows: mapped cleanly and not removed. */
export const usable = <T>(row: ParsedRow<T>): row is ParsedRow<T> & { base: { data: T } } =>
  !row.isRemoved && row.base.data !== null

/** First row (by file order) for each key; later rows with the same key are duplicates. */
export function firstRowByKey<T>(rows: ParsedRow<T>[], keyOf: (data: T) => string | null) {
  const first = new Map<string, ParsedRow<T>>()
  for (const row of rows) {
    if (!usable(row)) continue
    const key = keyOf(row.base.data)
    if (key !== null && !first.has(key)) first.set(key, row)
  }
  return first
}

/** The row that holds `key` first, when it is another row than this one. */
export function duplicateOf<T>(
  row: ParsedRow<T>,
  first: Map<string, ParsedRow<T>>,
  key: string | null
): ParsedRow<T> | null {
  if (key === null) return null
  const owner = first.get(key)
  return owner && owner !== row ? owner : null
}

/** A `DUPLICATE_ID` error on `field` when an earlier row holds the same key; the owner, if any. */
export function duplicateId<T>(
  extra: Extra,
  field: string,
  row: ParsedRow<T>,
  first: Map<string, ParsedRow<T>>,
  key: string | null
): ParsedRow<T> | null {
  const owner = duplicateOf(row, first, key)
  if (owner) extra.push(issue(field, 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
  return owner
}

/** A `VALUE_NORMALIZED` warning when the canonical spelling differs from the one written. */
export function normalized(extra: Extra, field: string, raw: string | null, value: string | null) {
  if (value !== raw)
    extra.push(issue(field, 'VALUE_NORMALIZED', 'warning', { raw: raw ?? '', value: value ?? '' }))
}
