/**
 * Seeds the database from the CSV exports in a directory, through the same importer, writer
 * and chunked commit (`importBatch`) the web import wizard uses. Errors skip the row, warnings import it with the fix applied;
 * both are summarised per code. Safe to run repeatedly (upsert by source ID).
 * The command line is `scripts/seed.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  archivedCandidates,
  COMMIT_ORDER,
  type DatasetKind,
  type ImportBatch,
  type ParsedRow,
  parseFile,
  summarize,
  validateBatch,
} from '@muni/importer'
import { todayIn } from '@muni/utils/dates'

import type { Db } from './client'
import { findArchivedKeys, loadReferenceSnapshot } from './reference'
import { importBatch } from './writer'

const log = (line: string) => process.stdout.write(`${line}\n`)

export async function seedFromDirectory(
  db: Db,
  dir: string,
  today = todayIn(),
  /** Records per commit; the wizard's, unless a test asks for smaller chunks. */
  { chunkSize }: { chunkSize?: number | undefined } = {}
) {
  const ctx = { today }
  const batch: ImportBatch = {}
  for (const name of readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.csv'))
    .sort()) {
    const file = parseFile(name, readFileSync(path.join(dir, name)), ctx)
    if (file.error || !file.kind) {
      log(`✗ ${name}: ${file.error ?? 'UNRECOGNIZED_FILE'} ${file.missingColumns.join(', ')}`)
      continue
    }
    log(`• ${name}: ${file.kind}, ${file.encoding}, "${file.delimiter}", ${file.rows.length} rows`)
    ;(batch as Record<string, unknown>)[file.kind] = file.rows
  }

  const reference = {
    ...(await loadReferenceSnapshot(db)),
    archived: await findArchivedKeys(db, archivedCandidates(batch)),
  }
  const validated = validateBatch(batch, reference)
  const written = await importBatch(db, validated, { chunkSize, asOf: today })
  const results: Partial<
    Record<DatasetKind, { created: number; updated: number; unchanged: number; skipped: number }>
  > = {}
  for (const kind of COMMIT_ORDER) {
    const rows = (validated[kind] ?? []) as ParsedRow<unknown>[]
    if (rows.length === 0) continue
    const { created, updated, unchanged } = written[kind] ?? {
      created: 0,
      updated: 0,
      unchanged: 0,
    }
    const summary = summarize(rows)
    const skipped = summary.invalid + summary.skipped
    results[kind] = { created, updated, unchanged, skipped }
    log(
      `\n${kind}: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped, ${summary.warnings} with warnings`
    )
    const codes = new Map<string, number>()
    for (const row of rows) {
      for (const issue of [...row.errors, ...row.warnings]) {
        const key = `${issue.severity === 'error' ? 'error  ' : 'warning'} ${issue.code} (${issue.field})`
        codes.set(key, (codes.get(key) ?? 0) + 1)
      }
    }
    for (const [key, count] of [...codes].sort()) log(`  ${key}: ${count}`)
  }
  return results
}
