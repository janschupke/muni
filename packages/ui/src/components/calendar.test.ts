import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMonths,
  clamp,
  endOfWeek,
  formatPattern,
  formatTyped,
  monthGrid,
  parseTime,
  parseTyped,
  sameMonth,
  startOfWeek,
  validIso,
} from './calendar'

describe('calendar arithmetic', () => {
  it('knows real dates', () => {
    expect(validIso('2024-02-29')).toBe('2024-02-29')
    expect(validIso('2026-02-29')).toBeNull()
    expect(validIso('2026-2-1')).toBeNull()
  })

  it('moves by days across months and the clock change, and by months to the last day', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('starts weeks on Monday and lays every month out in six of them', () => {
    // 1 March 2026 is a Sunday.
    expect(startOfWeek('2026-03-01')).toBe('2026-02-23')
    expect(endOfWeek('2026-03-02')).toBe('2026-03-08')
    const grid = monthGrid('2026-03-17')
    expect(grid).toHaveLength(6)
    expect(grid[0]?.[0]).toBe('2026-02-23')
    expect(grid[0]?.[6]).toBe('2026-03-01')
    expect(grid[5]?.[6]).toBe('2026-04-05')
    expect(sameMonth('2026-03-01', '2026-03-31')).toBe(true)
  })

  it('keeps a date within bounds', () => {
    expect(clamp('2026-01-01', '2026-02-01')).toBe('2026-02-01')
    expect(clamp('2026-12-01', undefined, '2026-06-30')).toBe('2026-06-30')
    expect(clamp('2026-03-01', '2026-01-01', '2026-12-31')).toBe('2026-03-01')
  })
})

describe('typed dates', () => {
  it('reads day, month and year with any separators, and ISO', () => {
    expect(parseTyped('01.03.2026')).toBe('2026-03-01')
    expect(parseTyped('1. 3. 2026')).toBe('2026-03-01')
    expect(parseTyped('1.3.26')).toBe('2026-03-01')
    expect(parseTyped('1/3/2026')).toBe('2026-03-01')
    expect(parseTyped(' 2026-03-01 ')).toBe('2026-03-01')
  })

  it('refuses what is not a date', () => {
    for (const text of ['', '31. 2. 2026', '1. 3.', 'tomorrow', '1. 3. 99999', '1/2/3/4'])
      expect(parseTyped(text), text).toBeNull()
  })

  it('writes dates the way the app shows them, and reads them back', () => {
    expect(formatTyped('2026-03-01')).toBe('01.03.2026')
    expect(formatPattern({ day: 'dd', month: 'mm', year: 'rrrr' })).toBe('dd.mm.rrrr')
    expect(parseTyped(formatTyped('2019-12-31'))).toBe('2019-12-31')
  })
})

describe('typed times', () => {
  it('reads hours, minutes and the usual separators', () => {
    expect(parseTime('9')).toBe('09:00')
    expect(parseTime('930')).toBe('09:30')
    expect(parseTime('0930')).toBe('09:30')
    expect(parseTime('9:30')).toBe('09:30')
    expect(parseTime('9.30')).toBe('09:30')
    expect(parseTime(' 17 05 ')).toBe('17:05')
    expect(parseTime('23:59')).toBe('23:59')
  })

  it('refuses what is not a time of day', () => {
    for (const text of ['', '24:00', '9:60', 'noon', '12345', '9:3:0'])
      expect(parseTime(text), text).toBeNull()
  })
})
