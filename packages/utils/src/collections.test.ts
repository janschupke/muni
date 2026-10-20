import { describe, expect, it } from 'vitest'

import { mostCommon } from './collections'

describe('mostCommon', () => {
  it('takes the most frequent value, the first by the order given on a tie', () => {
    expect(mostCommon([120, 90, 120, 90, 60], (a, b) => a - b)).toBe(90)
    expect(mostCommon(['09:00', '08:00', '09:00'], (a, b) => a.localeCompare(b))).toBe('09:00')
    expect(mostCommon(['10:00', '08:30'], (a, b) => a.localeCompare(b))).toBe('08:30')
  })

  it('has nothing to say about nothing', () => {
    expect(mostCommon([], (a: number, b: number) => a - b)).toBeUndefined()
  })
})
