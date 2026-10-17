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
  it('read a course, its code in capitals and the online choice as an override', () => {
    const course = {
      name: ' BOZP ',
      validityMonths: '24',
      requiredForAll: 'on',
      departmentIds: ['dep_lab'],
      sessionMinutes: '',
      groupSize: '12',
      onlineAllowed: 'no',
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
        groupSize: 12,
        onlineAllowed: false,
        capabilities: ['PROJECTOR'],
      },
    })
    const edited = parseForm(courseEditSpec, form({ ...course, onlineAllowed: 'derived' }))
    expect(edited.ok && edited.data.onlineAllowed).toBeNull()
    expect(parseForm(courseEditSpec, form({ ...course, onlineAllowed: 'yes' }))).toMatchObject({
      data: { onlineAllowed: true },
    })
  })

  it('read a session: unnamed seats only on an edit, none counting as zero', () => {
    const session = {
      courseId: 'course_bozp',
      date: '2026-11-04',
      startTime: '09:00',
      endTime: '12:00',
      roomId: 'room_aula_a',
      capacity: '20',
      pricePerPerson: '1 200 Kč',
      status: 'PLANNED',
    }
    expect(parseForm(sessionEditSpec, form(session))).toMatchObject({
      ok: true,
      data: { unnamedBookings: 0, capacity: 20, pricePerPerson: 1200 },
    })
    expect(parseForm(sessionCreateSpec, form(session))).toMatchObject({ ok: true })
    expect(parseForm(sessionCreateSpec, form({ ...session, endTime: '08:00' }))).toEqual({
      ok: false,
      state: { status: 'error', fieldErrors: { endTime: 'before_start' } },
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
