import type {
  CompletionInput,
  CourseInput,
  EmployeeInput,
  SessionInput,
} from '@muni/domain/schemas'

import type { IssueCode } from './issues'

export const DATASET_KINDS = ['courses', 'employees', 'sessions', 'completions'] as const
export type DatasetKind = (typeof DATASET_KINDS)[number]

export interface DatasetRecord {
  courses: CourseInput
  employees: EmployeeInput
  sessions: SessionInput
  completions: CompletionInput
}

export type Severity = 'error' | 'warning'

/**
 * A problem with one row. Carries a code and params, never a message:
 * the UI translates `import.issues.<code>` with `params`.
 */
export interface ValidationIssue {
  /** Column key, or `'row'` for whole-row problems. */
  field: string
  code: IssueCode
  severity: Severity
  params?: Record<string, string | number>
}

/** Output of mapping one row in isolation (no other rows, no DB). */
export interface RowMapResult<T> {
  data: T | null
  issues: ValidationIssue[]
}

export interface ParsedRow<T> {
  /** Physical line in the source file where the record starts (1-based, header = 1). */
  rowNumber: number
  /** Cell values by column key. Inline edits change this. */
  raw: Record<string, string>
  originalRaw: Record<string, string>
  /** Row-level mapping result; re-computed only when `raw` changes. */
  base: RowMapResult<T>
  /** Final record after cross-row validation (aliases resolved, canonical names applied). */
  data: T | null
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  isValid: boolean
  isEdited: boolean
  isRemoved: boolean
}

export type FileError = 'EMPTY_FILE' | 'UNRECOGNIZED_FILE' | 'MISSING_COLUMNS'

export interface ParsedFile<K extends DatasetKind = DatasetKind> {
  fileName: string
  kind: K | null
  encoding: 'utf-8' | 'windows-1250'
  delimiter: ',' | ';' | '\t'
  /** Column keys present in the file, in file order. */
  columns: string[]
  unknownColumns: string[]
  missingColumns: string[]
  skipped: { blankLines: number; repeatedHeaders: number; comments: number }
  error: FileError | null
  rows: ParsedRow<DatasetRecord[K]>[]
}

export type ImportBatch = {
  [K in DatasetKind]?: ParsedRow<DatasetRecord[K]>[]
}

/**
 * What already exists in the database, so a partial import (e.g. completions only)
 * can resolve references. Deliberately excludes personal data beyond what matching needs.
 */
export interface ReferenceSnapshot {
  courses: { code: string; validityMonths: number | null }[]
  employees: { externalId: string; email: string | null; fullName: string }[]
  departments: string[]
  positions: string[]
  providers: string[]
}

export const EMPTY_REFERENCE: ReferenceSnapshot = {
  courses: [],
  employees: [],
  departments: [],
  positions: [],
  providers: [],
}

export interface ValidationSummary {
  total: number
  valid: number
  invalid: number
  warnings: number
  removed: number
}
