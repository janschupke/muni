import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { addDays, diffInDays, todayIn } from '@muni/utils/dates'

// The register the browser suites run on: the import files (data/import) with every date
// moved so that the day they were written for, E2E_AS_OF, is today. What is ahead stays ahead
// and what is past stays past, however long after 2026 the suites run.

/**
 * The day the seeded register is seen from. From it, T030 and T016 (both overbooked) and T018
 * are still ahead, T001 and T015 are past, and BOZP-Z expiries fall after its last session
 * within the planner's reach, so the planner has a session to propose. No session falls on
 * it, so none is under way whatever the hour.
 */
export const E2E_AS_OF = '2026-10-27'

const SOURCE = path.join(import.meta.dirname, '../../../../data/import')

/** Where the moved files are written (ignored by git); the import spec uploads them too. */
export const REGISTER_DIR = path.join(import.meta.dirname, '../.register')

/** Days from E2E_AS_OF to today. */
const shift = () => diffInDays(E2E_AS_OF, todayIn())

/** A date of the register's files as the seeded register has it: moved to today's frame. */
export const seeded = (iso: string): string => addDays(iso, shift())

/** The same, as the app writes a date: `04.11.2026`. */
export const seededCzech = (iso: string): string => {
  const [year, month, day] = seeded(iso).split('-')
  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`
}

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g

/**
 * Writes the register's files with their dates moved, and returns their paths. Refuses a
 * session on today: whether it has started would depend on the hour the suite runs.
 */
export function writeRegister(): string[] {
  rmSync(REGISTER_DIR, { recursive: true, force: true })
  mkdirSync(REGISTER_DIR, { recursive: true })
  const today = todayIn()
  return readdirSync(SOURCE)
    .filter(name => name.endsWith('.csv'))
    .map(name => {
      const text = readFileSync(path.join(SOURCE, name), 'utf8').replace(ISO_DATE, seeded)
      if (name === 'terminy_skoleni.csv' && text.includes(`,${today},`))
        throw new Error(`a seeded session falls on today (${today}): pick another E2E_AS_OF`)
      const file = path.join(REGISTER_DIR, name)
      writeFileSync(file, text)
      return file
    })
}

/** The month a register date falls in once moved: the advisor's bucket and its English name. */
export function seededMonth(iso: string): { bucket: string; label: string } {
  const day = seeded(iso)
  const label = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
  return { bucket: day.slice(0, 7), label }
}
