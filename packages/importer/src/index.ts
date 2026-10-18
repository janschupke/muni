export {
  committable,
  editCell,
  type ImportContext,
  mapRow,
  MAX_FILE_BYTES,
  MAX_ROWS_PER_FILE,
  parseFile,
  revertRow,
  setRemoved,
  summarize,
} from './batch'
export { COLUMNS } from './columns'
export { ISSUE_CODES, type IssueCode, SKIPPING_CODES } from './issues'
export {
  type ArchivedKeys,
  DATASET_KINDS,
  type DatasetKind,
  type DatasetRecord,
  EMPTY_REFERENCE,
  type FileError,
  type ImportBatch,
  NO_ARCHIVED,
  type ParsedFile,
  type ParsedRow,
  type ReferenceSnapshot,
  type Severity,
  type ValidationIssue,
  type ValidationSummary,
} from './types'
export { archivedCandidates, validateBatch } from './validate'

/** Commit order: each dataset may reference the ones before it. */
export const COMMIT_ORDER = ['rooms', 'courses', 'employees', 'completions', 'sessions'] as const
