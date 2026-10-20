import { APP_ID_PREFIX } from '@muni/domain/schemas'
import { type IsoDate, parseDate } from '@muni/utils/dates'
import { parseCount, parseCzk } from '@muni/utils/money'
import { cleanFreeText, collapseWhitespace, isFormulaLike } from '@muni/utils/text'
import type * as z from 'zod'

import type { IssueCode } from '../issues'
import type { RowMapResult, ValidationIssue } from '../types'

const SUMMARY_LABELS = /^(celkem|soucet|součet|total|sum)$/i

/** Collects issues while one row is mapped. Field parsers return null on error. */
export class RowBuilder {
  readonly issues: ValidationIssue[] = []

  constructor(private readonly cells: Record<string, string>) {}

  /** The untouched cell value. */
  raw(field: string): string {
    return this.cells[field] ?? ''
  }

  get hasErrors(): boolean {
    return this.issues.some(i => i.severity === 'error')
  }

  error(field: string, code: IssueCode, params?: ValidationIssue['params']): null {
    this.issues.push({ field, code, severity: 'error', ...(params && { params }) })
    return null
  }

  warn(field: string, code: IssueCode, params?: ValidationIssue['params']): void {
    this.issues.push({ field, code, severity: 'warning', ...(params && { params }) })
  }

  /** Whether the file has the column at all (a blank cell still counts). */
  has(field: string): boolean {
    return Object.hasOwn(this.cells, field)
  }

  cell(field: string): string {
    return collapseWhitespace(this.cells[field] ?? '')
  }

  /** A footer like `Celkem;;;;;;;2865;` in the first column. */
  isSummaryRow(firstField: string): boolean {
    return SUMMARY_LABELS.test(this.cell(firstField))
  }

  /** Rejects the whole row as a spreadsheet footer. */
  rejectSummary(): RowMapResult<never> {
    this.error('row', 'SUMMARY_ROW')
    return { data: null, issues: this.issues }
  }

  required(field: string): string | null {
    const value = this.cell(field)
    return value === '' ? this.error(field, 'REQUIRED') : value
  }

  optional(field: string): string | null {
    const value = this.cell(field)
    return value === '' ? null : value
  }

  date(field: string, { required }: { required: boolean }): IsoDate | null {
    const result = parseDate(this.cells[field])
    if (result.ok) {
      if (result.format === 'excelSerial') {
        this.warn(field, 'EXCEL_SERIAL_DATE', { raw: this.cell(field), value: result.value })
      }
      return result.value
    }
    switch (result.reason) {
      case 'empty':
        return required ? this.error(field, 'REQUIRED') : null
      case 'placeholder':
        return this.error(field, 'PLACEHOLDER_DATE', { raw: this.cell(field) })
      case 'invalid':
      case 'unparseable':
        return this.error(field, 'INVALID_DATE', { raw: this.cell(field) })
    }
  }

  price(field: string): number | null {
    const result = parseCzk(this.cells[field])
    if (result.ok) {
      if (result.note === 'free') this.warn(field, 'FREE_PRICE', { raw: this.cell(field) })
      return result.value
    }
    switch (result.reason) {
      case 'empty':
        return null
      case 'negative':
        return this.error(field, 'NEGATIVE_PRICE', { raw: this.cell(field) })
      case 'unparseable':
        return this.error(field, 'INVALID_PRICE', { raw: this.cell(field) })
    }
  }

  count(field: string, { required }: { required: boolean }): number | null {
    const value = this.cell(field)
    if (value === '') return required ? this.error(field, 'REQUIRED') : null
    const count = parseCount(value)
    return count ?? this.error(field, 'INVALID_NUMBER', { raw: value })
  }

  /** Free text with spreadsheet formulas neutralised (CSV injection). */
  text(field: string): string | null {
    const value = this.cells[field] ?? ''
    if (isFormulaLike(value)) this.warn(field, 'FORMULA_STRIPPED', { raw: value.trim() })
    return cleanFreeText(value)
  }

  /** `" bozp_z "` → `"BOZP-Z"`. Unknown codes are caught later, against the catalog. */
  code(field: string): string | null {
    const value = this.cell(field)
    if (value === '') return this.error(field, 'REQUIRED')
    const normalized = value.toUpperCase().replace(/[\s_]+/g, '-')
    if (!/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/.test(normalized)) {
      return this.error(field, 'INVALID_CODE', { raw: value })
    }
    if (normalized !== (this.cells[field] ?? '')) {
      this.warn(field, 'CODE_NORMALIZED', {
        raw: (this.cells[field] ?? '').trim(),
        value: normalized,
      })
    }
    return normalized
  }

  /**
   * Final gate: the record must satisfy the domain schema the server re-checks on commit.
   * Anything the field parsers missed becomes INVALID_VALUE on the offending field.
   */
  finish<S extends z.ZodType>(schema: S, candidate: unknown): RowMapResult<z.output<S>> {
    if (this.hasErrors) return { data: null, issues: this.issues }
    const parsed = schema.safeParse(candidate)
    if (parsed.success) return { data: parsed.data, issues: this.issues }
    for (const issue of parsed.error.issues) {
      this.error(String(issue.path[0] ?? 'row'), 'INVALID_VALUE', { reason: issue.message })
    }
    return { data: null, issues: this.issues }
  }
}

/**
 * A source ID, unless it carries a prefix the app gives the records it creates (S… for
 * sessions, A… for completions, N… for people): an import must never overwrite those, so the
 * row is refused.
 */
export function reservedId(
  b: RowBuilder,
  id: string | null,
  kind: keyof typeof APP_ID_PREFIX
): string | null {
  if (id?.startsWith(APP_ID_PREFIX[kind])) return b.error('externalId', 'RESERVED_ID', { raw: id })
  return id
}
