import { describe, expect, it } from 'vitest'

import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatInteger,
  formatOptional,
  formatPercent,
  formatTime,
  formatTimeRange,
  PLACEHOLDER,
} from './format'

// Intl separates groups and units with (narrow) no-break spaces; compare them as plain spaces.
const plain = (value: string) => value.replace(/\s/g, ' ')

describe('dates and times', () => {
  it('formats a date-only value without shifting the day', () => {
    expect(plain(formatDate('2026-10-16', 'cs'))).toBe('16. 10. 2026')
    expect(plain(formatDate('2026-10-16', 'en'))).toBe('Oct 16, 2026')
    expect(plain(formatDate('2026-01-01', 'cs'))).toBe('1. 1. 2026')
  })

  it('formats instants in Prague time on both sides of DST', () => {
    expect(plain(formatDateTime('2026-10-14T07:00:00Z', 'cs'))).toBe('14. 10. 2026 9:00')
    expect(plain(formatDateTime('2026-10-14T07:00:00Z', 'en'))).toBe('Oct 14, 2026, 9:00 AM')
    expect(plain(formatTime('2026-12-16T12:00:00Z', 'cs'))).toBe('13:00')
    expect(plain(formatTime('2026-12-16T12:00:00Z', 'en'))).toBe('1:00 PM')
  })

  it('collapses a same-day range to one date', () => {
    const range = ['2026-10-14T07:00:00Z', '2026-10-14T10:00:00Z'] as const
    expect(plain(formatTimeRange(...range, 'cs'))).toBe('14. 10. 2026 9:00–12:00')
    expect(plain(formatTimeRange(...range, 'en'))).toBe('Oct 14, 2026, 9:00 AM–12:00 PM')
  })

  it('spells out both dates when a range crosses local midnight', () => {
    // 20:00Z is already 22:00 in Prague; the end is the next morning.
    expect(plain(formatTimeRange('2026-10-14T20:00:00Z', '2026-10-15T07:00:00Z', 'cs'))).toBe(
      '14. 10. 2026 22:00 – 15. 10. 2026 9:00'
    )
  })
})

describe('numbers', () => {
  it('drops the decimals of whole amounts and keeps two otherwise', () => {
    expect(plain(formatCurrency(450, 'cs'))).toBe('450 Kč')
    expect(plain(formatCurrency(2100, 'cs'))).toBe('2 100 Kč')
    expect(plain(formatCurrency(450.5, 'cs'))).toBe('450,50 Kč')
    expect(plain(formatCurrency(0, 'cs'))).toBe('0 Kč')
    expect(plain(formatCurrency(2100, 'en'))).toBe('CZK 2,100')
    expect(plain(formatCurrency(450.5, 'en'))).toBe('CZK 450.50')
  })

  it('formats counts and rates', () => {
    expect(plain(formatInteger(12345, 'cs'))).toBe('12 345')
    expect(formatInteger(12345, 'en')).toBe('12,345')
    expect(plain(formatPercent(0.873, 'cs'))).toBe('87 %')
    expect(formatPercent(0.873, 'en')).toBe('87%')
  })
})

describe('formatOptional', () => {
  it('shows the placeholder for a missing value only', () => {
    expect(formatOptional(null, String)).toBe(PLACEHOLDER)
    expect(formatOptional(undefined, String)).toBe(PLACEHOLDER)
    expect(formatOptional(0, String)).toBe('0')
  })
})
