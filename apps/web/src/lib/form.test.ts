import { courseEditSchema, sessionEditSchema } from '@muni/domain/schemas'
import { describe, expect, it } from 'vitest'

import { fieldErrors, list, money, number, text } from './form'

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

  it('reads amounts as the imports do, and leaves the rest for the schema', () => {
    const data = form({ a: '1 200,50 Kč', b: 'zdarma', c: '450,-', d: '-5', e: 'abc', f: ' ' })
    expect(money(data, 'a')).toBe(1200.5)
    expect(money(data, 'b')).toBe(0)
    expect(money(data, 'c')).toBe(450)
    expect(money(data, 'd')).toBe(-5)
    expect(money(data, 'e')).toBe('abc')
    expect(money(data, 'f')).toBeNull()
  })

  it('reads every value of a checkbox group', () => {
    const data = new FormData()
    data.append('capabilities', 'PROJECTOR')
    data.append('capabilities', 'COMPUTERS')
    data.append('capabilities', new Blob(['x']))
    expect(list(data, 'capabilities')).toEqual(['PROJECTOR', 'COMPUTERS'])
    expect(list(data, 'nothing')).toEqual([])
  })

  it('maps zod issues to translation keys', () => {
    const input = {
      name: null,
      validityMonths: 'x',
      requiredForAll: false,
      departmentIds: [],
      positionIds: [],
      sessionMinutes: null,
      groupSize: null,
      onlineAllowed: false,
      capabilities: [],
    }
    const result = courseEditSchema.safeParse(input)
    if (result.success) throw new Error('the schema accepted an invalid course')
    expect(fieldErrors(result.error, input)).toEqual({
      status: 'error',
      fieldErrors: { name: 'required', validityMonths: 'invalid_type' },
    })
  })

  it('surfaces refinement keys', () => {
    const input = {
      courseId: 'course_kyber',
      date: '2026-10-28',
      startTime: '12:00',
      endTime: '09:00',
      roomId: 'room_aula_a',
      capacity: 10,
      unnamedBookings: 0,
      pricePerPerson: null,
      status: 'PLANNED',
    }
    const result = sessionEditSchema.safeParse(input)
    if (result.success) throw new Error('the schema accepted an end before the start')
    expect(fieldErrors(result.error, input)).toMatchObject({
      fieldErrors: { endTime: 'before_start' },
    })
  })
})
