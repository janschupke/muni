import type { RoomFacts, SessionNeeds } from '@muni/domain/rooms'
import type {
  CompletionInput,
  CourseInput,
  EmployeeInput,
  RoomInput,
  SessionInput,
} from '@muni/domain/schemas'

import type { IssueCode } from './issues'

export const DATASET_KINDS = ['rooms', 'courses', 'employees', 'sessions', 'completions'] as const
export type DatasetKind = (typeof DATASET_KINDS)[number]

export interface DatasetRecord {
  rooms: RoomInput
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

/**
 * Records per commit: each chunk is one server call and one transaction the server re-validates.
 */
export const COMMIT_CHUNK_SIZE = 500

/** Commit order: each dataset may reference the ones before it. */
export const COMMIT_ORDER = ['rooms', 'courses', 'employees', 'completions', 'sessions'] as const

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
  /** Valid, but left out by a skipping warning (see SKIPPING_CODES). */
  isSkipped: boolean
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
  courses: {
    code: string
    validityMonths: number | null
    /**
     * What its sessions need from a room: equipment, and whether it may be online (true for a
     * course whose sessions are not set yet, since an import fills that from the very sessions
     * being checked).
     */
    needs?: SessionNeeds | undefined
    /** Providers (by name) that offer it. */
    offeredBy?: string[] | undefined
  }[]
  employees: { externalId: string; email: string | null; fullName: string }[]
  departments: string[]
  positions: string[]
  providers: string[]
  /** The provider an imported session that names none goes to; null when there is none. */
  defaultProvider?: string | null | undefined
  rooms: string[]
  /** What each room offers, by name, for the sessions' room checks. */
  roomFacts?: Omit<RoomFacts, 'id'>[] | undefined
  /** Planned sessions already in the register (Prague wall clock), for room clashes. */
  plannedSessions?:
    | { externalId: string; room: string; date: string; startTime: string; endTime: string }[]
    | undefined
  /**
   * Keys of THIS batch that only archived records hold: a row with one of them, or naming one,
   * is skipped. The server answers for the keys the browser sends (see archivedCandidates), so
   * nothing about an archived record reaches the browser that the files did not already say.
   */
  archived: ArchivedKeys
}

export interface ArchivedKeys {
  courses: string[]
  /** Employee IDs. */
  employees: string[]
  /** Archived people's emails, as managers named by email. */
  employeeEmails: string[]
  departments: string[]
  positions: string[]
  providers: string[]
  rooms: string[]
  /** Session IDs. */
  sessions: string[]
  /** Completion IDs. */
  completions: string[]
}

export const NO_ARCHIVED: ArchivedKeys = {
  courses: [],
  employees: [],
  employeeEmails: [],
  departments: [],
  positions: [],
  providers: [],
  rooms: [],
  sessions: [],
  completions: [],
}

export const EMPTY_REFERENCE: ReferenceSnapshot = {
  courses: [],
  employees: [],
  departments: [],
  positions: [],
  providers: [],
  rooms: [],
  archived: NO_ARCHIVED,
}

export interface ValidationSummary {
  total: number
  valid: number
  invalid: number
  /** Valid rows left out because they touch an archived record. */
  skipped: number
  warnings: number
  removed: number
}
