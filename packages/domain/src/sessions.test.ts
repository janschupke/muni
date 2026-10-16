import { describe, expect, it } from 'vitest'

import { NEARLY_FULL_RATIO, occupancy } from './sessions'

describe('occupancy', () => {
  it.each([
    [0, 30, 'OPEN'],
    [23, 30, 'OPEN'],
    [24, 30, 'NEARLY_FULL'],
    [28, 30, 'NEARLY_FULL'],
    [30, 30, 'FULL'],
    [31, 30, 'OVERBOOKED'],
    [0, 0, 'OPEN'],
    [1, 0, 'OVERBOOKED'],
  ])('%i booked of %i is %s', (booked, capacity, expected) => {
    expect(occupancy(booked, capacity)).toBe(expected)
  })

  it('turns yellow at the documented share', () => {
    expect(occupancy(NEARLY_FULL_RATIO * 100, 100)).toBe('NEARLY_FULL')
    expect(occupancy(NEARLY_FULL_RATIO * 100 - 1, 100)).toBe('OPEN')
  })
})
