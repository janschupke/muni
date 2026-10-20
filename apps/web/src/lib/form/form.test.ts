import {
  courseEditSchema,
  employeeEditSchema,
  providerSchema,
  sessionEditSchema,
} from '@muni/domain/schemas'
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
      seats: null,
      onlineAllowed: false,
      capabilities: [],
    }
    const result = courseEditSchema.safeParse(input)
    if (result.success) throw new Error('the schema accepted an invalid course')
    expect(fieldErrors(result.error, input)).toEqual({
      status: 'error',
      fieldErrors: { name: 'required', validityMonths: 'not_a_number' },
    })
  })

  it('names what a format or a limit is about, with the limit', () => {
    const provider = {
      name: 'x'.repeat(201),
      companyId: null,
      email: 'not-an-email',
      phone: 'call me',
      website: 'https://exa mple',
      note: null,
    }
    const wrongProvider = providerSchema.safeParse(provider)
    if (wrongProvider.success) throw new Error('the schema accepted an invalid provider')
    expect(fieldErrors(wrongProvider.error, provider)).toEqual({
      status: 'error',
      fieldErrors: {
        name: 'too_long',
        email: 'invalid_email',
        phone: 'invalid_phone',
        website: 'invalid_url',
      },
      values: { name: { max: 200 } },
    })
    const person = {
      firstName: 'Marie',
      lastName: 'Černá',
      email: null,
      nationalId: '12',
      departmentId: null,
      positionId: null,
      managerId: null,
      leadsDepartment: false,
      hiredOn: '2026-02-30',
      leftOn: null,
      status: 'ACTIVE',
      note: null,
    }
    const wrongPerson = employeeEditSchema.safeParse(person)
    if (wrongPerson.success) throw new Error('the schema accepted an invalid person')
    expect(fieldErrors(wrongPerson.error, person)).toEqual({
      status: 'error',
      fieldErrors: { nationalId: 'invalid_national_id', hiredOn: 'invalid_date' },
    })
    const course = {
      name: 'BOZP',
      validityMonths: 0,
      requiredForAll: false,
      departmentIds: [],
      positionIds: [],
      sessionMinutes: 900,
      seats: null,
      onlineAllowed: null,
      capabilities: [],
    }
    const wrongCourse = courseEditSchema.safeParse(course)
    if (wrongCourse.success) throw new Error('the schema accepted an invalid course')
    expect(fieldErrors(wrongCourse.error, course)).toMatchObject({
      fieldErrors: { validityMonths: 'too_small_number', sessionMinutes: 'too_big_number' },
      values: { validityMonths: { min: 1 }, sessionMinutes: { max: 720 } },
    })
  })

  it('surfaces refinement keys', () => {
    const input = {
      courseId: 'course_kyber',
      providerId: 'prv_internal',
      date: '2026-10-28',
      startTime: '12:00',
      roomId: 'room_aula_a',
      capacity: 10,
      unnamedBookings: 11,
    }
    const result = sessionEditSchema.safeParse(input)
    if (result.success) throw new Error('the schema accepted more unnamed seats than seats')
    expect(fieldErrors(result.error, input)).toMatchObject({
      fieldErrors: { capacity: 'over_capacity' },
    })
  })
})
