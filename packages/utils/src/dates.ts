/**
 * Date-only values travel through the app as ISO strings (`YYYY-MM-DD`).
 * They become `Date` objects (UTC midnight) only at the database boundary.
 */
export type IsoDate = string

export type DateFormat = 'iso' | 'czech' | 'excelSerial'

export type DateParseResult =
  | { ok: true; value: IsoDate; format: DateFormat }
  | { ok: false; reason: 'empty' | 'unparseable' | 'invalid' | 'placeholder' }

/** Dates at or before this year are spreadsheet placeholders, not real events. */
const PLACEHOLDER_MAX_YEAR = 1900

// 1899-12-30 is day 0 of the Excel 1900 date system (it absorbs the 1900 leap-year bug).
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
// "6. 1. 2019", "06.01.2019", "6.1.2019"
const CZECH_RE = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/
const EXCEL_SERIAL_RE = /^\d{5}$/

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fromParts(year: number, month: number, day: number, format: DateFormat): DateParseResult {
  if (!isValidCalendarDate(year, month, day)) return { ok: false, reason: 'invalid' }
  if (year <= PLACEHOLDER_MAX_YEAR) return { ok: false, reason: 'placeholder' }
  return { ok: true, value: toIsoDate(year, month, day), format }
}

/** Parses the date shapes found in the source exports. */
export function parseDate(raw: string | null | undefined): DateParseResult {
  const value = (raw ?? '').trim()
  if (value === '') return { ok: false, reason: 'empty' }

  const iso = ISO_RE.exec(value)
  if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), 'iso')

  const czech = CZECH_RE.exec(value)
  if (czech) return fromParts(Number(czech[3]), Number(czech[2]), Number(czech[1]), 'czech')

  if (EXCEL_SERIAL_RE.test(value)) {
    const date = new Date(EXCEL_EPOCH_UTC + Number(value) * DAY_MS)
    return fromParts(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      'excelSerial'
    )
  }

  return { ok: false, reason: 'unparseable' }
}

/** Adds calendar months, clamping to the last day of the target month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = splitIsoDate(date)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return toIsoDate(year, month, Math.min(d, daysInMonth(year, month)))
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return isoDateFromUtc(new Date(isoDateToUtc(date).getTime() + days * DAY_MS))
}

export function diffInDays(from: IsoDate, to: IsoDate): number {
  return Math.round((isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime()) / DAY_MS)
}

function splitIsoDate(date: IsoDate): [number, number, number] {
  const match = ISO_RE.exec(date)
  if (!match) throw new Error(`Not an ISO date: ${date}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** ISO date → `Date` at UTC midnight (the shape Postgres `date` columns round-trip as). */
export function isoDateToUtc(date: IsoDate): Date {
  const [y, m, d] = splitIsoDate(date)
  return new Date(Date.UTC(y, m - 1, d))
}

/** `Date` read from a `date` column → ISO date. Reads UTC parts, never local ones. */
export function isoDateFromUtc(date: Date): IsoDate {
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export const APP_TIME_ZONE = 'Europe/Prague'

/** Today's calendar date in the given zone. */
export function todayIn(timeZone: string = APP_TIME_ZONE, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Prague: +60 or +120). */
function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

/** Wall-clock time in `timeZone` → UTC instant. `("2026-10-14", "09:00")` → 07:00Z. */
export function zonedTimeToUtc(
  date: IsoDate,
  time: string,
  timeZone: string = APP_TIME_ZONE
): Date {
  const [y, m, d] = splitIsoDate(date)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0)
  // Two passes settle the offset across DST transitions.
  const first = guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60_000
  return new Date(guess - zoneOffsetMinutes(timeZone, new Date(first)) * 60_000)
}

const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/

/** `"09:00-12:00"` → `{ start: "09:00", end: "12:00" }`. */
export function parseTimeRange(raw: string): { start: string; end: string } | null {
  const match = TIME_RANGE_RE.exec(raw.trim())
  if (!match) return null
  const [, h1, m1, h2, m2] = match.map(Number) as [number, number, number, number, number]
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null
  if (h2 * 60 + m2 <= h1 * 60 + m1) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return { start: `${pad(h1)}:${pad(m1)}`, end: `${pad(h2)}:${pad(m2)}` }
}
