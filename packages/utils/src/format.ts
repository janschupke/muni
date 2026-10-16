import { isoDateToUtc, type IsoDate } from './dates'

// Intl formatters are expensive to build; cache one per (locale, options) pair.
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>()

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`
  let formatter = cache.get(key) as Intl.DateTimeFormat | undefined
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    cache.set(key, formatter)
  }
  return formatter
}

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`
  let formatter = cache.get(key) as Intl.NumberFormat | undefined
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    cache.set(key, formatter)
  }
  return formatter
}

/** Formats a date-only value. Always reads it as UTC so the day never shifts. */
export function formatDate(date: IsoDate, locale: string): string {
  return dateFormatter(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(isoDateToUtc(date))
}

export function formatDateTime(instant: Date | string, locale: string, timeZone: string): string {
  return dateFormatter(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(instant)
  )
}

export function formatTime(instant: Date | string, locale: string, timeZone: string): string {
  return dateFormatter(locale, { timeStyle: 'short', timeZone }).format(new Date(instant))
}

export function formatCzk(amount: number, locale: string): string {
  return numberFormatter(locale, {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export function formatInteger(value: number, locale: string): string {
  return numberFormatter(locale, { maximumFractionDigits: 0 }).format(value)
}

/** `ratio` is 0–1. */
export function formatPercent(ratio: number, locale: string): string {
  return numberFormatter(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)
}
