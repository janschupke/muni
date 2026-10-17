import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { formatRate } from './format-rate'

describe('formatRate', () => {
  it('prints the whole percent, rounded down, so it never reads more than is held', () => {
    expect(formatRate(26 / 29, 'en')).toBe('89%')
    expect(formatRate(0.9, 'en')).toBe('90%')
    expect(formatRate(299 / 300, 'en')).toBe('99%')
    expect(formatRate(1, 'cs')).toBe('100 %')
  })

  it('is the only way a rate is printed: plain percents are for room use only', () => {
    const src = path.resolve(import.meta.dirname, '..')
    const offenders = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter(f => /\.tsx?$/.test(f) && !f.includes('.test.') && !f.startsWith('features/rooms/'))
      .filter(f => readFileSync(path.join(src, f), 'utf8').includes('formatPercent('))
    expect(offenders).toEqual(['lib/format-rate.ts'])
  })
})
