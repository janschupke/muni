import { DateTime } from 'luxon'

import { APP_TIME_ZONE, type IsoDate, isoDateToUtc } from './dates'

/** What a table cell or detail row shows for a missing value. */
export const PLACEHOLDER = '—'

/** `fn(value)`, or the placeholder when there is no value. */
export function formatOptional<T>(value: T | null | undefined, fn: (value: T) => string): string {
  return value === null || value === undefined ? PLACEHOLDER : fn(value)
}

// Luxon caches its own Intl.DateTimeFormat instances; NumberFormat needs ours.
const numberCache = new Map<string, Intl.NumberFormat>()

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = numberCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberCache.set(key, formatter)
  }
  return formatter
}

// Dates and times are written one way in both languages, as the register is kept in Czech:
// 17.10.2026, 9:00. Written by pattern, not by Intl, so the server and the browser agree.
const DATE = 'dd.LL.yyyy'
const TIME = 'H:mm'
const DATE_TIME = `${DATE} ${TIME}`

function instantIn(instant: Date | string, timeZone: string): DateTime {
  return DateTime.fromJSDate(new Date(instant), { zone: timeZone })
}

/** A date-only value: `17.10.2026`. Always read as UTC so the day never shifts. */
export function formatDate(date: IsoDate): string {
  return DateTime.fromJSDate(isoDateToUtc(date), { zone: 'utc' }).toFormat(DATE)
}

/** A calendar month, `2026-11` → "November 2026" / "listopad 2026". */
export function formatMonth(month: string, locale: string): string {
  return DateTime.fromJSDate(isoDateToUtc(`${month}-01`), { zone: 'utc' })
    .setLocale(locale)
    .toLocaleString({ month: 'long', year: 'numeric' })
}

/** Two days as one range: `18.10.2026 – 31.10.2026`. */
export function formatDateRange(from: IsoDate, to: IsoDate): string {
  return `${formatDate(from)} – ${formatDate(to)}`
}

/** An instant in the app's time zone: `17.10.2026 9:00`. */
export function formatDateTime(instant: Date | string, timeZone: string = APP_TIME_ZONE): string {
  return instantIn(instant, timeZone).toFormat(DATE_TIME)
}

/** A time of day: `9:00`. */
export function formatTime(instant: Date | string, timeZone: string = APP_TIME_ZONE): string {
  return instantIn(instant, timeZone).toFormat(TIME)
}

/**
 * `16.10.2026 9:00–12:00` when both ends fall on the same local day, otherwise the full date
 * and time on both sides.
 */
export function formatTimeRange(
  start: Date | string,
  end: Date | string,
  timeZone: string = APP_TIME_ZONE
): string {
  const from = instantIn(start, timeZone)
  const to = instantIn(end, timeZone)
  return from.hasSame(to, 'day')
    ? `${from.toFormat(DATE_TIME)}–${to.toFormat(TIME)}`
    : `${from.toFormat(DATE_TIME)} – ${to.toFormat(DATE_TIME)}`
}

/** Every amount the app stores and shows is in this currency. */
export const CURRENCY = 'CZK'

// Money is written the Czech way in both languages, always with its two decimals, so a column
// of amounts lines up: 1 200,00 Kč.
const MONEY_LOCALE = 'cs-CZ'

/** An amount in the currency: `1 200,00 Kč`; no amount is the placeholder. */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return PLACEHOLDER
  return numberFormatter(MONEY_LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** An amount as a price field shows it, for editing: `450,50`, no symbol, no grouping. */
export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return ''
  return numberFormatter(MONEY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(amount)
}

/** The currency's symbol, for a price field's label: `Kč`. */
export function currencySymbol(): string {
  return (
    numberFormatter(MONEY_LOCALE, { style: 'currency', currency: CURRENCY })
      .formatToParts(0)
      .find(p => p.type === 'currency')?.value ?? CURRENCY
  )
}

export function formatInteger(value: number, locale: string): string {
  return numberFormatter(locale, { maximumFractionDigits: 0 }).format(value)
}

/** A score or weight: `42.5`, `−3`; `signed` adds `+` to positives (score terms). */
export function formatDecimal(
  value: number,
  locale: string,
  { digits = 1, signed = false }: { digits?: number; signed?: boolean } = {}
): string {
  return numberFormatter(locale, {
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value)
}

/** `ratio` is 0–1. */
export function formatPercent(ratio: number, locale: string): string {
  return numberFormatter(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)
}

const relativeCache = new Map<string, Intl.RelativeTimeFormat>()

/** `in 12 days`, `3 days ago`, `tomorrow` (cs: `za 12 dní`, `před 3 dny`, `zítra`). */
export function formatRelativeDays(days: number, locale: string): string {
  let formatter = relativeCache.get(locale)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeCache.set(locale, formatter)
  }
  return formatter.format(days, 'day')
}
