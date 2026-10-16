import { DateTime } from 'luxon'

import { APP_TIME_ZONE, isoDateToUtc, type IsoDate } from './dates'

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

const DATE = { dateStyle: 'medium' } as const
const DATE_TIME = { dateStyle: 'medium', timeStyle: 'short' } as const
const TIME = { timeStyle: 'short' } as const

function instantIn(instant: Date | string, locale: string, timeZone: string): DateTime {
  return DateTime.fromJSDate(new Date(instant), { zone: timeZone }).setLocale(locale)
}

/** Formats a date-only value. Always reads it as UTC so the day never shifts. */
export function formatDate(date: IsoDate, locale: string): string {
  return DateTime.fromJSDate(isoDateToUtc(date), { zone: 'utc' })
    .setLocale(locale)
    .toLocaleString(DATE)
}

/** A calendar month, `2026-11` → "November 2026" / "listopad 2026". */
export function formatMonth(month: string, locale: string): string {
  return DateTime.fromJSDate(isoDateToUtc(`${month}-01`), { zone: 'utc' })
    .setLocale(locale)
    .toLocaleString({ month: 'long', year: 'numeric' })
}

export function formatDateTime(
  instant: Date | string,
  locale: string,
  timeZone: string = APP_TIME_ZONE
): string {
  return instantIn(instant, locale, timeZone).toLocaleString(DATE_TIME)
}

export function formatTime(
  instant: Date | string,
  locale: string,
  timeZone: string = APP_TIME_ZONE
): string {
  return instantIn(instant, locale, timeZone).toLocaleString(TIME)
}

/**
 * `16. 10. 2026 9:00–12:00` when both ends fall on the same local day,
 * otherwise the full date and time on both sides.
 */
export function formatTimeRange(
  start: Date | string,
  end: Date | string,
  locale: string,
  timeZone: string = APP_TIME_ZONE
): string {
  const from = instantIn(start, locale, timeZone)
  const to = instantIn(end, locale, timeZone)
  return from.hasSame(to, 'day')
    ? `${from.toLocaleString(DATE_TIME)}–${to.toLocaleString(TIME)}`
    : `${from.toLocaleString(DATE_TIME)} – ${to.toLocaleString(DATE_TIME)}`
}

/** Every amount the app stores and shows is in this currency. */
export const CURRENCY = 'CZK'

/**
 * Whole amounts drop the decimals (`450 Kč`); anything else keeps two (`450,50 Kč`).
 * No amount is the placeholder.
 */
export function formatCurrency(amount: number | null | undefined, locale: string): string {
  if (amount === null || amount === undefined) return PLACEHOLDER
  const whole = Number.isInteger(amount)
  return numberFormatter(locale, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount)
}

/** How the locale writes the currency on its own (`Kč`, `CZK`), for a field's label. */
export function currencySymbol(locale: string): string {
  return (
    numberFormatter(locale, { style: 'currency', currency: CURRENCY })
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
