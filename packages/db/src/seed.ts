/**
 * Seeds the database from the CSV exports in /data, through the same importer and writer
 * the web import wizard uses. Errors skip the row, warnings import it with the fix applied;
 * both are summarised per code. Safe to run repeatedly (upsert by source ID).
 *
 *   pnpm db:seed               # ../../data
 *   pnpm db:seed -- <dir>      # another export directory
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  COMMIT_ORDER,
  committable,
  parseFile,
  summarize,
  validateBatch,
  type ImportBatch,
  type ParsedRow,
} from '@muni/importer'
import { todayIn } from '@muni/utils/dates'

import { createDb, type Db } from './client'
import { loadReferenceSnapshot } from './reference'
import { chunk, commitChunk } from './writer'

const log = (line: string) => process.stdout.write(`${line}\n`)

export async function seedFromDirectory(db: Db, dir: string, today = todayIn()) {
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

  const validated = validateBatch(batch, await loadReferenceSnapshot(db))
  const results: Record<string, { created: number; updated: number; skipped: number }> = {}
  for (const kind of COMMIT_ORDER) {
    const rows = (validated[kind] ?? []) as ParsedRow<unknown>[]
    if (rows.length === 0) continue
    const records = committable(validated, kind)
    let created = 0
    let updated = 0
    for (const part of chunk(records)) {
      const result = await commitChunk(db, kind, part)
      created += result.created
      updated += result.updated
    }
    const summary = summarize(rows)
    results[kind] = { created, updated, skipped: summary.invalid }
    log(
      `\n${kind}: ${created} created, ${updated} updated, ${summary.invalid} skipped, ${summary.warnings} with warnings`
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

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
if (isMain) {
  const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '../../../data'))
  const db = createDb()
  seedFromDirectory(db, dir)
    .then(() => db.$disconnect())
    .catch(async (error: unknown) => {
      console.error(error)
      await db.$disconnect()
      process.exit(1)
    })
}
