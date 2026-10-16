import { DateTime } from 'luxon'

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
const EXCEL_EPOCH = DateTime.utc(1899, 12, 30)

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
// "6. 1. 2019", "06.01.2019", "6.1.2019"
const CZECH_RE = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/
const EXCEL_SERIAL_RE = /^\d{5}$/

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  return DateTime.utc(year, month, day).isValid
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
    const date = EXCEL_EPOCH.plus({ days: Number(value) })
    return fromParts(date.year, date.month, date.day, 'excelSerial')
  }

  return { ok: false, reason: 'unparseable' }
}

/** A date-only value as a luxon `DateTime` at UTC midnight. Throws on anything but `YYYY-MM-DD`. */
function utcDay(date: IsoDate): DateTime<true> {
  const match = ISO_RE.exec(date)
  const day = match ? DateTime.utc(Number(match[1]), Number(match[2]), Number(match[3])) : null
  if (!day?.isValid) throw new Error(`Not an ISO date: ${date}`)
  return day
}

function isoOf(value: DateTime<true>): IsoDate {
  return value.toISODate()
}

/** Adds calendar months, clamping to the last day of the target month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  return isoOf(utcDay(date).plus({ months }))
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return isoOf(utcDay(date).plus({ days }))
}

export function diffInDays(from: IsoDate, to: IsoDate): number {
  return Math.round(utcDay(to).diff(utcDay(from), 'days').days)
}

/** ISO date → `Date` at UTC midnight (the shape Postgres `date` columns round-trip as). */
/** Easter Sunday of a Gregorian year (the anonymous Gregorian computus). */
function easterSunday(year: number): IsoDate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toIsoDate(year, month, day)
}

// Czech public holidays on fixed dates (zákon č. 245/2000 Sb.), as MM-DD.
const FIXED_HOLIDAYS = new Set([
  '01-01',
  '05-01',
  '05-08',
  '07-05',
  '07-06',
  '09-28',
  '10-28',
  '11-17',
  '12-24',
  '12-25',
  '12-26',
])

/** A Czech public holiday: a fixed date, Good Friday or Easter Monday. */
export function isCzechHoliday(date: IsoDate): boolean {
  if (FIXED_HOLIDAYS.has(date.slice(5))) return true
  const easter = easterSunday(Number(date.slice(0, 4)))
  return date === addDays(easter, -2) || date === addDays(easter, 1)
}

/** Monday to Friday, and not a Czech public holiday. */
export function isWorkingDay(date: IsoDate): boolean {
  const weekday = isoDateToUtc(date).getUTCDay()
  return weekday !== 0 && weekday !== 6 && !isCzechHoliday(date)
}

export function isoDateToUtc(date: IsoDate): Date {
  return utcDay(date).toJSDate()
}

/** `Date` read from a `date` column → ISO date. Reads UTC parts, never local ones. */
export function isoDateFromUtc(date: Date): IsoDate {
  return valid(DateTime.fromJSDate(date, { zone: 'utc' }), 'date').toISODate()
}

export const APP_TIME_ZONE = 'Europe/Prague'

function valid(value: DateTime<true> | DateTime<false>, what: string): DateTime<true> {
  if (!value.isValid)
    throw new Error(`Invalid ${what}: ${value.invalidExplanation ?? value.invalidReason}`)
  return value
}

/** Today's calendar date in the given zone. */
export function todayIn(timeZone: string = APP_TIME_ZONE, now: Date = new Date()): IsoDate {
  return valid(DateTime.fromJSDate(now, { zone: timeZone }), 'time zone').toISODate()
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/

/**
 * Wall-clock time in `timeZone` → UTC instant. `("2026-10-14", "09:00")` → 07:00Z.
 * A time inside a spring-forward gap (02:30 on the last Sunday of March) moves forward
 * by the gap, to 03:30 local; an ambiguous autumn time resolves to its first occurrence.
 */
export function zonedTimeToUtc(
  date: IsoDate,
  time: string,
  timeZone: string = APP_TIME_ZONE
): Date {
  const day = utcDay(date)
  const match = TIME_RE.exec(time)
  if (!match) throw new Error(`Not a time: ${time}`)
  const local = DateTime.fromObject(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour: Number(match[1]),
      minute: Number(match[2]),
    },
    { zone: timeZone }
  )
  return valid(local, 'wall-clock time').toJSDate()
}

/** UTC instant → the date and `HH:mm` a wall clock in `timeZone` shows. */
export function toZonedParts(
  instant: Date | string,
  timeZone: string = APP_TIME_ZONE
): { date: IsoDate; time: string } {
  const local = valid(DateTime.fromJSDate(new Date(instant), { zone: timeZone }), 'instant')
  return { date: local.toISODate(), time: local.toFormat('HH:mm') }
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
