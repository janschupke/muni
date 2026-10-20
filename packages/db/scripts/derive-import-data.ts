/**
 * Writes the import files derived from the raw exports (`data/*.csv` → `data/import/`):
 * `pnpm data:derive`. See data/import/README.md for what they are and the rules.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { deriveImportFiles } from '@muni/importer/derive'

const DATA = path.join(import.meta.dirname, '../../../data')
const OUT = path.join(DATA, 'import')

const sources = readdirSync(DATA)
  .filter(name => name.toLowerCase().endsWith('.csv'))
  .sort()
  .map(name => ({ name, bytes: readFileSync(path.join(DATA, name)) }))
const derived = deriveImportFiles(sources)
for (const [name, text] of Object.entries(derived.files)) {
  mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true })
  writeFileSync(path.join(OUT, name), text)
}
for (const [name, { kept, leftOut }] of Object.entries(derived.accounted))
  process.stdout.write(`${name}: ${String(kept.length)} kept, ${String(leftOut.length)} left out\n`)
process.stdout.write(
  `${String(derived.inferences.length)} inferences, ${String(derived.ambiguities.length)} ambiguities (data/import/review/)\n`
)
