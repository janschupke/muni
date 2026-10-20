import { describe, expect, it } from 'vitest'

import {
  currencySymbol,
  formatAmount,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatInteger,
  formatMonth,
  formatOptional,
  formatPercent,
  formatRelativeDays,
  formatSessionTime,
  formatTimeRange,
  PLACEHOLDER,
} from './format'

// Intl separates groups and units with (narrow) no-break spaces; compare them as plain spaces.
const plain = (value: string) => value.replace(/\s/g, ' ')

describe('dates and times', () => {
  // One way in both languages, by pattern: the same on the server and in the browser.
  it('formats a date-only value as dd.mm.yyyy, without shifting the day', () => {
    expect(formatDate('2026-10-16')).toBe('16.10.2026')
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
    expect(formatDateRange('2026-10-18', '2026-10-31')).toBe('18.10.2026 – 31.10.2026')
  })

  it('formats instants in Prague time on both sides of DST', () => {
    expect(formatDateTime('2026-10-14T07:00:00Z')).toBe('14.10.2026 9:00')
    expect(formatDateTime('2026-12-16T12:00:00Z')).toBe('16.12.2026 13:00')
    expect(formatDateTime('2026-12-16T07:05:00Z')).toBe('16.12.2026 8:05')
  })

  it('names a month in the language', () => {
    expect(formatMonth('2026-11', 'en')).toBe('November 2026')
    expect(formatMonth('2027-01', 'cs')).toBe('leden 2027')
  })

  it('collapses a same-day range to one date', () => {
    expect(formatTimeRange('2026-10-14T07:00:00Z', '2026-10-14T10:00:00Z')).toBe(
      '14.10.2026 9:00–12:00'
    )
  })

  it('writes when a session runs', () => {
    expect(
      formatSessionTime({ startsAt: '2026-10-14T07:00:00Z', endsAt: '2026-10-14T10:00:00Z' })
    ).toBe('14.10.2026 9:00–12:00')
  })

  it('spells out both dates when a range crosses local midnight', () => {
    // 20:00Z is already 22:00 in Prague; the end is the next morning.
    expect(formatTimeRange('2026-10-14T20:00:00Z', '2026-10-15T07:00:00Z')).toBe(
      '14.10.2026 22:00 – 15.10.2026 9:00'
    )
  })
})

describe('numbers', () => {
  it('writes money the Czech way, always with two decimals', () => {
    expect(plain(formatCurrency(450))).toBe('450,00 Kč')
    expect(plain(formatCurrency(2100))).toBe('2 100,00 Kč')
    expect(plain(formatCurrency(450.5))).toBe('450,50 Kč')
    expect(plain(formatCurrency(0))).toBe('0,00 Kč')
    expect(formatCurrency(null)).toBe(PLACEHOLDER)
    expect(formatCurrency(undefined)).toBe(PLACEHOLDER)
  })

  it('writes an amount for a price field to edit, and names the currency', () => {
    expect(formatAmount(450.5)).toBe('450,50')
    expect(formatAmount(2100)).toBe('2100,00')
    expect(formatAmount(null)).toBe('')
    expect(currencySymbol()).toBe('Kč')
  })

  it('formats counts and rates', () => {
    expect(plain(formatInteger(12345, 'cs'))).toBe('12 345')
    expect(formatInteger(12345, 'en')).toBe('12,345')
    expect(plain(formatPercent(0.873, 'cs'))).toBe('87 %')
    expect(formatPercent(0.873, 'en')).toBe('87%')
  })
})

describe('formatRelativeDays', () => {
  it('reads like speech in both languages', () => {
    expect(formatRelativeDays(12, 'en')).toBe('in 12 days')
    expect(formatRelativeDays(-3, 'en')).toBe('3 days ago')
    expect(formatRelativeDays(1, 'en')).toBe('tomorrow')
    expect(plain(formatRelativeDays(12, 'cs'))).toBe('za 12 dní')
    expect(plain(formatRelativeDays(-3, 'cs'))).toBe('před 3 dny')
    expect(formatRelativeDays(0, 'cs')).toBe('dnes')
  })
})

describe('formatOptional', () => {
  it('shows the placeholder for a missing value only', () => {
    expect(formatOptional(null, String)).toBe(PLACEHOLDER)
    expect(formatOptional(undefined, String)).toBe(PLACEHOLDER)
    expect(formatOptional(0, String)).toBe('0')
  })
})
