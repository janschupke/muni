import { describe, expect, it } from 'vitest'

import {
  addMonths,
  diffInDays,
  isoDateFromUtc,
  isoDateToUtc,
  parseDate,
  parseTimeRange,
  todayIn,
  toZonedParts,
  zonedTimeToUtc,
} from './dates'

describe('parseDate', () => {
  // Every shape below is copied verbatim from data/*.csv.
  it.each([
    ['2019-01-06', '2019-01-06', 'iso'],
    ['6. 1. 2019', '2019-01-06', 'czech'],
    ['16. 1. 2019', '2019-01-16', 'czech'],
    ['6. 10. 2019', '2019-10-06', 'czech'],
    ['31.07.2023', '2023-07-31', 'czech'],
    ['43552', '2019-03-28', 'excelSerial'],
    ['  2021-05-31 ', '2021-05-31', 'iso'],
  ])('%j → %s (%s)', (raw, expected, format) => {
    expect(parseDate(raw)).toEqual({ ok: true, value: expected, format })
  })

  it('rejects an impossible calendar date', () => {
    expect(parseDate('31. 9. 2026')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseDate('2025-02-29')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('flags 1900 placeholders in both formats', () => {
    expect(parseDate('1900-01-01')).toEqual({ ok: false, reason: 'placeholder' })
    expect(parseDate('1. 1. 1902')).toEqual({ ok: true, value: '1902-01-01', format: 'czech' })
    expect(parseDate('1. 1. 1900')).toEqual({ ok: false, reason: 'placeholder' })
  })

  it('distinguishes empty from garbage', () => {
    expect(parseDate('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseDate(undefined)).toEqual({ ok: false, reason: 'empty' })
    expect(parseDate('simona.pokorna@vzorova.example')).toEqual({
      ok: false,
      reason: 'unparseable',
    })
  })
})

describe('date arithmetic', () => {
  it('clamps month ends', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2019-01-06', 24)).toBe('2021-01-06')
    expect(addMonths('2023-11-15', 3)).toBe('2024-02-15')
  })

  it('counts days across DST without drift', () => {
    expect(diffInDays('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('round-trips through UTC midnight', () => {
    expect(isoDateFromUtc(isoDateToUtc('2026-10-16'))).toBe('2026-10-16')
  })
})

describe('time zones', () => {
  it('resolves Prague wall-clock time on both sides of DST', () => {
    expect(zonedTimeToUtc('2026-10-14', '09:00').toISOString()).toBe('2026-10-14T07:00:00.000Z')
    expect(zonedTimeToUtc('2026-12-16', '13:00').toISOString()).toBe('2026-12-16T12:00:00.000Z')
  })

  it('moves a time inside the spring-forward gap forward by the gap', () => {
    // 02:00–03:00 does not exist in Prague on 29 March 2026; 02:30 becomes 03:30 CEST.
    expect(zonedTimeToUtc('2026-03-29', '02:30').toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('resolves an ambiguous autumn time to its first occurrence', () => {
    expect(zonedTimeToUtc('2026-10-25', '02:30').toISOString()).toBe('2026-10-25T00:30:00.000Z')
  })

  it('splits an instant back into Prague wall-clock fields', () => {
    expect(toZonedParts('2026-10-14T07:00:00Z')).toEqual({ date: '2026-10-14', time: '09:00' })
    expect(toZonedParts(new Date('2026-12-31T23:30:00Z'))).toEqual({
      date: '2027-01-01',
      time: '00:30',
    })
  })

  it("reads today's date in Prague, not UTC", () => {
    // 23:30 UTC on 15 Oct is already 16 Oct in Prague (UTC+2).
    expect(todayIn('Europe/Prague', new Date('2026-10-15T23:30:00Z'))).toBe('2026-10-16')
  })
})

describe('parseTimeRange', () => {
  it('parses the session time column', () => {
    expect(parseTimeRange('07:30-15:30')).toEqual({ start: '07:30', end: '15:30' })
    expect(parseTimeRange('9:00 – 12:00')).toEqual({ start: '09:00', end: '12:00' })
  })

  it('rejects inverted or malformed ranges', () => {
    expect(parseTimeRange('12:00-09:00')).toBeNull()
    expect(parseTimeRange('dopoledne')).toBeNull()
  })
})
