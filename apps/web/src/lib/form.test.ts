import { courseEditSchema, sessionEditSchema } from '@muni/domain/schemas'
import { describe, expect, it } from 'vitest'

import { fieldErrors, number, text } from './form'

const form = (entries: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe('form helpers', () => {
  it('reads text and numbers with Czech formatting', () => {
    const data = form({ a: '  ', b: ' 1 200,50 ', c: 'abc' })
    expect(text(data, 'a')).toBeNull()
    expect(number(data, 'b')).toBe(1200.5)
    expect(number(data, 'c')).toBe('abc')
  })

  it('maps zod issues to translation keys', () => {
    const input = { name: null, validityMonths: 'x' }
    const result = courseEditSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(fieldErrors(result.error, input)).toEqual({
        status: 'error',
        fieldErrors: { name: 'required', validityMonths: 'invalid_type' },
      })
    }
  })

  it('surfaces refinement keys', () => {
    const input = {
      date: '2026-10-28',
      startTime: '12:00',
      endTime: '09:00',
      location: 'Aula A',
      isOnline: false,
      capacity: 10,
      bookedCount: 0,
      pricePerPerson: null,
      status: 'PLANNED',
    }
    const result = sessionEditSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(fieldErrors(result.error, input)).toMatchObject({
        fieldErrors: { endTime: 'before_start' },
      })
  })
})
