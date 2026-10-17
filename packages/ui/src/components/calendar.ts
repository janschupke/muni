// Calendar arithmetic on ISO dates (`YYYY-MM-DD`), done in UTC so no time zone or daylight
// saving shift can move a day. The pickers post ISO dates and `HH:mm` times, as the app's
// schemas expect.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

export const isoOf = (date: Date) => date.toISOString().slice(0, 10)

/**
 * The date itself when it is a real calendar date (`2026-02-30` is not), otherwise null.
 * @internal Exported for its tests.
 */
export function validIso(text: string): string | null {
  const match = ISO.exec(text)
  if (!match) return null
  return isoOf(toDate(text)) === text ? text : null
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoOf(date)
}

/** The same day `months` later, or the month's last day when it is shorter (31 Jan + 1 → 28 Feb). */
export function addMonths(iso: string, months: number): string {
  const date = toDate(iso)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return isoOf(date)
}

/** Monday = 1 … Sunday = 7. */
const weekday = (iso: string) => toDate(iso).getUTCDay() || 7

/** The first day of the week holding `iso` (weeks start on Monday). */
export const startOfWeek = (iso: string) => addDays(iso, 1 - weekday(iso))
export const endOfWeek = (iso: string) => addDays(iso, 7 - weekday(iso))

const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

/**
 * The month holding `iso` as six weeks of dates, Monday first: always six rows, so the
 * calendar keeps its height from month to month.
 */
export function monthGrid(iso: string): string[][] {
  const first = startOfWeek(startOfMonth(iso))
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(first, week * 7 + day))
  )
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)

/** `iso` kept within `min`..`max` (either may be absent). */
export function clamp(iso: string, min?: string, max?: string): string {
  if (min !== undefined && iso < min) return min
  if (max !== undefined && iso > max) return max
  return iso
}

/**
 * How a date is typed, spelled with the given letters: `dd.mm.rrrr`, `dd.mm.yyyy`. Day, month,
 * year in both languages, as every date in the app is written. The field's placeholder: a hint
 * at the format, never a date that could pass for a value.
 */
export function formatPattern(letters: Record<'day' | 'month' | 'year', string>): string {
  return `${letters.day}.${letters.month}.${letters.year}`
}

/** A date as typed in the field and shown everywhere else: `01.03.2026`. */
export function formatTyped(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-')
  return `${day}.${month}.${year}`
}

/**
 * Reads a typed date: ISO (`2026-03-01`) or day, month and year with any separators
 * (`1.3.2026`, `01. 03. 2026`, `1/3/26`). Two-digit years are this century. Null when it is
 * not a real date.
 */
export function parseTyped(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const iso = validIso(trimmed)
  if (iso) return iso
  const numbers = trimmed.split(/\D+/).filter(Boolean).map(Number)
  if (numbers.length !== 3) return null
  const [day = 0, month = 0] = numbers
  let year = numbers[2] ?? 0
  if (year < 100) year += 2000
  if (year < 1000 || year > 9999) return null
  return validIso(
    `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  )
}

/**
 * Reads a typed time: `9`, `930`, `0930`, `9:30`, `9.30`, `9 30` → `09:30`. Null when it is
 * not a time of day.
 */
export function parseTime(text: string): string | null {
  const trimmed = text.trim()
  let hours: number
  let minutes: number
  const split = /^(\d{1,2})\D+(\d{1,2})$/.exec(trimmed)
  if (split) {
    hours = Number(split[1])
    minutes = Number(split[2])
  } else if (/^\d{1,4}$/.test(trimmed)) {
    const digits = trimmed.length <= 2 ? `${trimmed.padStart(2, '0')}00` : trimmed.padStart(4, '0')
    hours = Number(digits.slice(0, 2))
    minutes = Number(digits.slice(2))
  } else {
    return null
  }
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
