import { describe, expect, it } from 'vitest'

import { NEW_PROVIDER } from './form'
import {
  completionSpec,
  courseCreateSpec,
  courseEditSpec,
  departmentSpec,
  employeeSpec,
  parseForm,
  positionSpec,
  providerSpec,
  roomSpec,
  sessionCreateSpec,
  sessionEditSpec,
} from './form-inputs'

const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries))
    for (const one of [value].flat()) data.append(key, one)
  return data
}

describe('form specs', () => {
  it('read a course, its code in capitals and online as a checkbox', () => {
    const course = {
      name: ' BOZP ',
      validityMonths: '24',
      requiredForAll: 'on',
      departmentIds: ['dep_lab'],
      sessionMinutes: '',
      seats: '12',
      capabilities: ['PROJECTOR'],
    }
    expect(parseForm(courseCreateSpec, form({ ...course, code: 'bozp-n' }))).toEqual({
      ok: true,
      data: {
        code: 'BOZP-N',
        name: 'BOZP',
        validityMonths: 24,
        requiredForAll: true,
        departmentIds: ['dep_lab'],
        positionIds: [],
        sessionMinutes: null,
        seats: 12,
        onlineAllowed: false,
        capabilities: ['PROJECTOR'],
      },
    })
    expect(parseForm(courseEditSpec, form({ ...course, onlineAllowed: 'on' }))).toMatchObject({
      data: { onlineAllowed: true },
    })
    // A length out of bounds says so on the field.
    expect(parseForm(courseEditSpec, form({ ...course, sessionMinutes: '5' }))).toMatchObject({
      state: { fieldErrors: { sessionMinutes: 'too_small_number' } },
    })
  })

  it('read a session: its course, provider, start, room and seats; no end, no price', () => {
    const session = {
      courseId: 'course_bozp',
      providerId: 'prv_internal',
      date: '2026-11-04',
      startTime: '09:00',
      roomId: 'room_aula_a',
      capacity: '20',
    }
    expect(parseForm(sessionEditSpec, form(session))).toEqual({
      ok: true,
      data: {
        courseId: 'course_bozp',
        providerId: 'prv_internal',
        date: '2026-11-04',
        startTime: '09:00',
        roomId: 'room_aula_a',
        capacity: 20,
        unnamedBookings: 0,
      },
    })
    expect(parseForm(sessionCreateSpec, form({ ...session, providerId: '' }))).toEqual({
      ok: false,
      state: { status: 'error', fieldErrors: { providerId: 'required' } },
    })
  })

  it('read a provider and the courses it offers, row by row', () => {
    const provider = {
      name: 'Externí lektor',
      'offerings.0.courseId': 'course_bozp',
      'offerings.0.price': '450,50',
      'offerings.1.courseId': 'course_gdpr',
      'offerings.1.price': '0',
      isDefault: 'on',
    }
    expect(parseForm(providerSpec, form(provider))).toMatchObject({
      ok: true,
      data: {
        name: 'Externí lektor',
        isDefault: true,
        offerings: [
          { courseId: 'course_bozp', price: 450.5 },
          { courseId: 'course_gdpr', price: 0 },
        ],
      },
    })
    // A row with no course, a price below zero: each on its own field.
    expect(
      parseForm(
        providerSpec,
        form({ ...provider, 'offerings.2.courseId': '', 'offerings.2.price': '-5' })
      )
    ).toEqual({
      ok: false,
      state: {
        status: 'error',
        fieldErrors: {
          'offerings.2.courseId': 'required',
          'offerings.2.price': 'too_small_number',
        },
        values: { 'offerings.2.price': { min: 0 } },
      },
    })
    // A course twice: on the second row's course.
    expect(
      parseForm(providerSpec, form({ ...provider, 'offerings.1.courseId': 'course_bozp' }))
    ).toEqual({
      ok: false,
      state: { status: 'error', fieldErrors: { 'offerings.1.courseId': 'duplicate' } },
    })
    expect(parseForm(providerSpec, form({ name: 'Bez nabídky' }))).toMatchObject({
      ok: true,
      data: { offerings: [], isDefault: false },
    })
  })

  it('read a person with the email in lower case', () => {
    const parsed = parseForm(
      employeeSpec,
      form({
        firstName: 'Marie',
        lastName: 'Černá',
        email: 'Marie.Cerna@Firma.cz',
        hiredOn: '2020-01-01',
        status: 'ACTIVE',
        leadsDepartment: 'on',
      })
    )
    expect(parsed).toEqual({
      ok: false,
      state: { status: 'error', fieldErrors: { leadsDepartment: 'no_department' } },
    })
    expect(
      parseForm(
        employeeSpec,
        form({
          firstName: 'M',
          lastName: 'Č',
          email: 'A@B.CZ',
          hiredOn: '2020-01-01',
          status: 'ACTIVE',
        })
      )
    ).toMatchObject({ ok: true, data: { email: 'a@b.cz', leadsDepartment: false } })
  })

  it('want a name when a new provider is chosen, and none otherwise', () => {
    const completion = {
      employeeId: 'emp_E0153',
      courseId: 'course_bozp',
      completedOn: '2026-10-16',
      newProviderName: 'Ignored',
    }
    expect(
      parseForm(
        completionSpec,
        form({ ...completion, providerId: NEW_PROVIDER, newProviderName: ' ' })
      )
    ).toEqual({
      ok: false,
      state: { status: 'error', fieldErrors: { newProviderName: 'required' } },
    })
    expect(
      parseForm(
        completionSpec,
        form({ ...completion, providerId: NEW_PROVIDER, newProviderName: 'Nový' })
      )
    ).toMatchObject({ ok: true, data: { providerId: null, newProviderName: 'Nový' } })
    expect(parseForm(completionSpec, form({ ...completion, providerId: 'prov_a' }))).toMatchObject({
      ok: true,
      data: { providerId: 'prov_a', newProviderName: null },
    })
  })

  it('read providers, rooms, departments and positions', () => {
    expect(
      parseForm(providerSpec, form({ name: 'Ústav', website: 'www.vzor.example' }))
    ).toMatchObject({
      data: { website: 'https://www.vzor.example', email: null },
    })
    expect(parseForm(roomSpec, form({ name: 'Aula', kind: 'CLASSROOM' }))).toEqual({
      ok: false,
      state: { status: 'error', fieldErrors: { capacity: 'required' } },
    })
    expect(parseForm(roomSpec, form({ name: 'Teams', kind: 'ONLINE' }))).toMatchObject({
      ok: true,
      data: { capacity: null, capabilities: [] },
    })
    expect(parseForm(departmentSpec, form({ name: 'Knihovna', headId: '' }))).toEqual({
      ok: true,
      data: { name: 'Knihovna', headId: null },
    })
    expect(parseForm(positionSpec, form({ name: 'Vedoucí', departmentIds: ['a', 'b'] }))).toEqual({
      ok: true,
      data: { name: 'Vedoucí', departmentIds: ['a', 'b'] },
    })
  })
})
