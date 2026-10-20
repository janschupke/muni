import type { IsoDate } from '@muni/utils/dates'

import { COLUMNS, detectKind, resolveColumnMap } from './parse/columns'
import { detectDelimiter, isBlankRecord, isCommentRecord, parseCsv } from './parse/csv'
import { decode } from './parse/decode'
import { isCommitted, rowState } from './row-state'
import { mapCompletion } from './rows/completions'
import { mapCourse } from './rows/courses'
import { mapEmployee } from './rows/employees'
import { RowBuilder } from './rows/fields'
import { mapRoom } from './rows/rooms'
import { mapSession } from './rows/sessions'
import {
  COMMIT_ORDER,
  type DatasetKind,
  type DatasetRecord,
  type ImportBatch,
  type ParsedFile,
  type ParsedRow,
  type ReferenceSnapshot,
  type RowMapResult,
  type ValidationSummary,
} from './types'
import { validateBatch } from './validate'

export interface ImportContext {
  /** Today in the app time zone; used for "future completion" and status checks. */
  today: IsoDate
}

type Mapper<K extends DatasetKind> = (
  b: RowBuilder,
  ctx: ImportContext
) => RowMapResult<DatasetRecord[K]>

const MAPPERS: { [K in DatasetKind]: Mapper<K> } = {
  rooms: b => mapRoom(b),
  courses: b => mapCourse(b),
  employees: mapEmployee,
  sessions: mapSession,
  completions: mapCompletion,
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ROWS_PER_FILE = 20_000

export function mapRow<K extends DatasetKind>(
  kind: K,
  raw: Record<string, string>,
  ctx: ImportContext
): RowMapResult<DatasetRecord[K]> {
  return MAPPERS[kind](new RowBuilder(raw), ctx)
}

function newRow<K extends DatasetKind>(
  kind: K,
  rowNumber: number,
  raw: Record<string, string>,
  ctx: ImportContext
): ParsedRow<DatasetRecord[K]> {
  const base = mapRow(kind, raw, ctx)
  return {
    rowNumber,
    raw,
    originalRaw: raw,
    base,
    data: base.data,
    errors: base.issues.filter(i => i.severity === 'error'),
    warnings: base.issues.filter(i => i.severity === 'warning'),
    isValid: base.data !== null,
    isSkipped: false,
    isEdited: false,
    isRemoved: false,
  }
}

/**
 * Decodes, sniffs, parses and row-maps one uploaded file. Cross-file checks happen
 * in `validateBatch` once every file of the batch is known.
 */
export function parseFile(fileName: string, bytes: Uint8Array, ctx: ImportContext): ParsedFile {
  const { text, encoding } = decode(bytes)
  const delimiter = detectDelimiter(text)
  const records = parseCsv(text, delimiter)
  const empty: ParsedFile = {
    fileName,
    kind: null,
    encoding,
    delimiter,
    columns: [],
    unknownColumns: [],
    missingColumns: [],
    skipped: { blankLines: 0, repeatedHeaders: 0, comments: 0 },
    error: 'EMPTY_FILE',
    rows: [],
  }

  const headerIndex = records.findIndex(r => !isBlankRecord(r))
  const header = records[headerIndex]
  if (!header) return empty

  const kind = detectKind(header.cells)
  if (!kind) return { ...empty, error: 'UNRECOGNIZED_FILE', unknownColumns: header.cells }

  const map = resolveColumnMap(header.cells, COLUMNS[kind])
  const columns = Object.entries(map.indexOf)
    .sort(([, a], [, b]) => a - b)
    .map(([key]) => key)
  const base = {
    ...empty,
    kind,
    columns,
    unknownColumns: map.unknown,
    missingColumns: map.missing,
    error: null,
  }
  if (map.missing.length > 0) return { ...base, error: 'MISSING_COLUMNS' }

  const headerSignature = header.cells.join('\u0000')
  const skipped = { blankLines: 0, repeatedHeaders: 0, comments: 0 }
  const rows: ParsedRow<DatasetRecord[DatasetKind]>[] = []
  for (const record of records.slice(headerIndex + 1, headerIndex + 1 + MAX_ROWS_PER_FILE)) {
    if (isBlankRecord(record)) {
      skipped.blankLines++
      continue
    }
    if (isCommentRecord(record)) {
      skipped.comments++
      continue
    }
    if (record.cells.join('\u0000') === headerSignature) {
      skipped.repeatedHeaders++
      continue
    }
    const raw: Record<string, string> = {}
    for (const [key, index] of Object.entries(map.indexOf)) raw[key] = record.cells[index] ?? ''
    const row = newRow(kind, record.line, raw, ctx)
    if (record.cells.length > header.cells.length) {
      row.base = {
        data: null,
        issues: [
          ...row.base.issues,
          {
            field: 'row',
            code: 'TOO_MANY_CELLS',
            severity: 'error',
            params: { expected: header.cells.length, actual: record.cells.length },
          },
        ],
      }
    }
    rows.push(row)
  }
  return { ...base, skipped, rows }
}

// ---- row operations (all return a new, re-validated batch) ----------------------------

type RowUpdate = (row: ParsedRow<unknown>) => ParsedRow<unknown>

function updateRow(
  batch: ImportBatch,
  kind: DatasetKind,
  index: number,
  update: RowUpdate,
  reference: ReferenceSnapshot
): ImportBatch {
  const rows = batch[kind]
  if (!rows?.[index]) return batch
  const next = [...rows] as ParsedRow<unknown>[]
  next[index] = update(next[index] as ParsedRow<unknown>)
  return validateBatch({ ...batch, [kind]: next }, reference)
}

export function editCell(
  batch: ImportBatch,
  kind: DatasetKind,
  index: number,
  field: string,
  value: string,
  ctx: ImportContext,
  reference: ReferenceSnapshot
): ImportBatch {
  return updateRow(
    batch,
    kind,
    index,
    row => {
      const raw = { ...row.raw, [field]: value }
      const isEdited = Object.keys(raw).some(k => raw[k] !== row.originalRaw[k])
      return { ...row, raw, base: mapRow(kind, raw, ctx), isEdited }
    },
    reference
  )
}

export function setRemoved(
  batch: ImportBatch,
  kind: DatasetKind,
  index: number,
  isRemoved: boolean,
  reference: ReferenceSnapshot
): ImportBatch {
  return updateRow(batch, kind, index, row => ({ ...row, isRemoved }), reference)
}

export function revertRow(
  batch: ImportBatch,
  kind: DatasetKind,
  index: number,
  ctx: ImportContext,
  reference: ReferenceSnapshot
): ImportBatch {
  return updateRow(
    batch,
    kind,
    index,
    row => ({
      ...row,
      raw: row.originalRaw,
      base: mapRow(kind, row.originalRaw, ctx),
      isEdited: false,
    }),
    reference
  )
}

export function summarize(rows: readonly ParsedRow<unknown>[]): ValidationSummary {
  const summary: ValidationSummary = {
    total: rows.length,
    valid: 0,
    invalid: 0,
    skipped: 0,
    warnings: 0,
    removed: 0,
  }
  for (const row of rows) {
    const state = rowState(row)
    if (state === 'REMOVED') summary.removed++
    else if (state === 'INVALID') summary.invalid++
    else if (state === 'SKIPPED') summary.skipped++
    else summary.valid++
    if (state === 'VALID' && row.warnings.length > 0) summary.warnings++
  }
  return summary
}

/** The records that will be written: valid, not skipped and not removed. */
export function committable<K extends DatasetKind>(
  batch: ImportBatch,
  kind: K
): DatasetRecord[K][] {
  const rows: ParsedRow<DatasetRecord[K]>[] = batch[kind] ?? []
  return rows.filter(isCommitted).map(row => row.data)
}

/** How many records a commit writes, over every dataset in the batch. */
export function countCommittable(batch: ImportBatch): number {
  return COMMIT_ORDER.reduce((sum, kind) => sum + committable(batch, kind).length, 0)
}
