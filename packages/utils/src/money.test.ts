import { describe, expect, it } from 'vitest'

import { parseCount, parseCzk } from './money'

describe('parseCzk', () => {
  // Verbatim shapes from data/absolvovana_skoleni.csv and data/terminy_skoleni.csv.
  it.each([
    ['450,00', 450],
    ['0,00', 0],
    ['1 200,00', 1200],
    ['2 100 Kč', 2100],
    ['450,- Kč', 450],
    ['800', 800],
    ['6500', 6500],
  ])('%j → %d', (raw, expected) => {
    expect(parseCzk(raw)).toEqual({ ok: true, value: expected })
  })

  it('reads "zdarma" as zero and says so', () => {
    expect(parseCzk('zdarma')).toEqual({ ok: true, value: 0, note: 'free' })
  })

  it('rejects negatives, blanks and garbage', () => {
    expect(parseCzk('-450,00')).toEqual({ ok: false, reason: 'negative' })
    expect(parseCzk('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseCzk('zkontrolovat"')).toEqual({ ok: false, reason: 'unparseable' })
  })
})

describe('parseCount', () => {
  it('accepts whole numbers only', () => {
    expect(parseCount(' 40 ')).toBe(40)
    expect(parseCount('0')).toBe(0)
    expect(parseCount('-1')).toBeNull()
    expect(parseCount('2 roky')).toBeNull()
  })
})
