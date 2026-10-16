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

/** Whole amounts drop the decimals (`450 Kč`); anything else keeps two (`450,50 Kč`). */
export function formatCurrency(amount: number, locale: string, currency = 'CZK'): string {
  const whole = Number.isInteger(amount)
  return numberFormatter(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount)
}

export function formatInteger(value: number, locale: string): string {
  return numberFormatter(locale, { maximumFractionDigits: 0 }).format(value)
}

/** `ratio` is 0–1. */
export function formatPercent(ratio: number, locale: string): string {
  return numberFormatter(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)
}
