import type { ParsedRow } from './types'

/**
 * What happens to a row on commit: the user removed it, an error refuses it, a skipping
 * warning leaves it out (see `SKIPPING_CODES`), or it is written.
 */
export type RowState = 'REMOVED' | 'INVALID' | 'SKIPPED' | 'VALID'

export function rowState(row: ParsedRow<unknown>): RowState {
  if (row.isRemoved) return 'REMOVED'
  if (!row.isValid) return 'INVALID'
  if (row.isSkipped) return 'SKIPPED'
  return 'VALID'
}

/** A row that will be written, with its record. */
export const isCommitted = <T>(row: ParsedRow<T>): row is ParsedRow<T> & { data: T } =>
  rowState(row) === 'VALID' && row.data !== null
