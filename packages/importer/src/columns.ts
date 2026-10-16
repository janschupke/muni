import { fold } from '@muni/utils/text'

import type { DatasetKind } from './types'

export interface ColumnSchema {
  key: string
  /** Accepted header spellings; matched after folding (case, diacritics, separators). */
  csvHeaders: string[]
  required?: boolean
}

export const COLUMNS = {
  courses: [
    { key: 'code', csvHeaders: ['kod', 'kod_skoleni', 'code'], required: true },
    { key: 'name', csvHeaders: ['nazev', 'name', 'title'], required: true },
    { key: 'validity', csvHeaders: ['platnost_mesicu', 'validity_months', 'platnost'] },
    { key: 'requiredFor', csvHeaders: ['povinne_pro', 'required_for', 'mandatory_for'] },
    { key: 'note', csvHeaders: ['poznamka', 'note'] },
  ],
  employees: [
    { key: 'externalId', csvHeaders: ['id_zamestnance', 'employee_id', 'id'], required: true },
    { key: 'firstName', csvHeaders: ['jmeno', 'first_name', 'firstname'], required: true },
    {
      key: 'lastName',
      csvHeaders: ['prijmeni', 'last_name', 'lastname', 'surname'],
      required: true,
    },
    { key: 'email', csvHeaders: ['email', 'e_mail'] },
    { key: 'department', csvHeaders: ['utvar', 'oddeleni', 'department'] },
    { key: 'position', csvHeaders: ['pozice', 'position', 'role'] },
    { key: 'managerEmail', csvHeaders: ['vedouci_email', 'manager_email'] },
    { key: 'hiredOn', csvHeaders: ['datum_nastupu', 'hired_on', 'start_date'], required: true },
    { key: 'leftOn', csvHeaders: ['datum_ukonceni', 'left_on', 'end_date'] },
    { key: 'status', csvHeaders: ['stav', 'status'], required: true },
    { key: 'nationalId', csvHeaders: ['rodne_cislo', 'national_id'] },
    { key: 'note', csvHeaders: ['poznamka', 'note'] },
  ],
  sessions: [
    { key: 'externalId', csvHeaders: ['id_terminu', 'session_id'], required: true },
    { key: 'courseCode', csvHeaders: ['kod_skoleni', 'course_code'], required: true },
    { key: 'date', csvHeaders: ['datum', 'date'], required: true },
    { key: 'time', csvHeaders: ['cas', 'time'], required: true },
    { key: 'location', csvHeaders: ['misto', 'location'], required: true },
    { key: 'capacity', csvHeaders: ['kapacita', 'capacity'], required: true },
    { key: 'bookedCount', csvHeaders: ['obsazeno', 'booked'] },
    { key: 'price', csvHeaders: ['cena_na_osobu', 'price_per_person', 'price'] },
    { key: 'status', csvHeaders: ['stav', 'status'] },
  ],
  completions: [
    { key: 'externalId', csvHeaders: ['id_zaznamu', 'record_id'], required: true },
    { key: 'employeeExternalId', csvHeaders: ['id_zamestnance', 'employee_id'], required: true },
    { key: 'employeeName', csvHeaders: ['zamestnanec', 'employee_name'] },
    { key: 'courseCode', csvHeaders: ['kod_skoleni', 'course_code'], required: true },
    { key: 'completedOn', csvHeaders: ['datum_absolvovani', 'completed_on'], required: true },
    { key: 'validUntil', csvHeaders: ['platnost_do', 'valid_until'] },
    { key: 'provider', csvHeaders: ['poskytovatel', 'provider'] },
    { key: 'price', csvHeaders: ['cena_kc', 'cena', 'price'] },
    { key: 'note', csvHeaders: ['poznamka', 'note'] },
  ],
} as const satisfies Record<DatasetKind, ColumnSchema[]>

function headerKey(header: string): string {
  return fold(header)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export interface ColumnMap {
  /** Column key → cell index. */
  indexOf: Record<string, number>
  missing: string[]
  unknown: string[]
}

export function resolveColumnMap(
  header: readonly string[],
  schema: readonly ColumnSchema[]
): ColumnMap {
  const indexOf: Record<string, number> = {}
  const unknown: string[] = []
  header.forEach((cell, index) => {
    const key = headerKey(cell)
    const column = schema.find(
      c => !(c.key in indexOf) && c.csvHeaders.some(h => headerKey(h) === key)
    )
    if (column) indexOf[column.key] = index
    else if (cell.trim() !== '') unknown.push(cell.trim())
  })
  const missing = schema.filter(c => c.required && !(c.key in indexOf)).map(c => c.key)
  return { indexOf, missing, unknown }
}

/**
 * Identifies a file by its header. The kind with the most matched columns wins;
 * a file matching fewer than half of any schema's required columns is unrecognised.
 */
export function detectKind(header: readonly string[]): DatasetKind | null {
  let best: { kind: DatasetKind; score: number } | null = null
  for (const [kind, schema] of Object.entries(COLUMNS) as [DatasetKind, ColumnSchema[]][]) {
    const map = resolveColumnMap(header, schema)
    const required = schema.filter(c => c.required).length
    const matchedRequired = required - map.missing.length
    if (matchedRequired * 2 < required) continue
    const score = Object.keys(map.indexOf).length * 10 + matchedRequired - map.unknown.length
    if (!best || score > best.score) best = { kind, score }
  }
  return best?.kind ?? null
}
