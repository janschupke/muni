import { describe, expect, it } from 'vitest'

import {
  completionEditSchema,
  completionSchema,
  courseEditSchema,
  courseSchema,
  departmentSchema,
  employeeEditSchema,
  employeeSchema,
  positionSchema,
  providerSchema,
  requirementScopeSchema,
  roomSchema,
  sessionCreateSchema,
  sessionEditSchema,
  sessionSchema,
} from './schemas'

/** The issue codes a failed parse reports, per path ("leftOn: before_hired"). */
function issues(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string; code: string }[] }
}) {
  return (result.error?.issues ?? []).map(i => `${i.path.join('.')}: ${i.message}`)
}

const employee = {
  externalId: 'E0153',
  firstName: 'Marie',
  lastName: 'Černá',
  email: 'marie.cerna@vzorova.example',
  nationalId: '665917/0359',
  department: 'Laboratoře',
  position: 'Laborantka',
  managerEmail: null,
  hiredOn: '2019-03-01',
  leftOn: null,
  status: 'ACTIVE',
  note: null,
}

const session = {
  externalId: 'T016',
  courseCode: 'BOZP-Z',
  date: '2026-11-04',
  startTime: '08:00',
  endTime: '11:00',
  location: 'Aula A',
  capacity: 30,
  bookedCount: 31,
  pricePerPerson: 450,
  status: 'PLANNED',
}

const completion = {
  externalId: 'Z000001',
  employeeExternalId: 'E0153',
  courseCode: 'BOZP-Z',
  completedOn: '2024-11-05',
  validUntil: '2026-11-05',
  provider: 'Bezpečná firma s.r.o.',
  price: 450,
  note: null,
}

describe('records', () => {
  it('accepts clean records and trims text', () => {
    expect(employeeSchema.parse({ ...employee, firstName: '  Marie ' }).firstName).toBe('Marie')
    expect(sessionSchema.parse(session).capacity).toBe(30)
    expect(completionSchema.parse(completion).validUntil).toBe('2026-11-05')
    expect(
      courseSchema.parse({
        code: 'LAB-BEZ',
        name: 'Bezpečná práce v laboratoři',
        validityMonths: 24,
        requirements: [{ scope: 'ALL' }, { scope: 'DEPARTMENT', department: 'Laboratoře' }],
      }).requirements
    ).toHaveLength(2)
  })

  it('rejects malformed codes and identifiers', () => {
    expect(
      courseSchema.safeParse({ code: 'bozp_z', name: 'x', validityMonths: null, requirements: [] })
        .success
    ).toBe(false)
    expect(employeeSchema.safeParse({ ...employee, externalId: 'E1' }).success).toBe(false)
    expect(employeeSchema.safeParse({ ...employee, nationalId: '6659170359X' }).success).toBe(false)
    expect(requirementScopeSchema.safeParse('TEAM').success).toBe(false)
  })

  it('refuses dates that run backwards, by a named code', () => {
    expect(issues(employeeSchema.safeParse({ ...employee, leftOn: '2018-01-01' }))).toEqual([
      'leftOn: before_hired',
    ])
    expect(employeeSchema.safeParse({ ...employee, leftOn: '2025-01-31' }).success).toBe(true)
    expect(issues(sessionSchema.safeParse({ ...session, endTime: '07:00' }))).toEqual([
      'endTime: before_start',
    ])
    expect(issues(completionSchema.safeParse({ ...completion, validUntil: '2024-01-01' }))).toEqual(
      ['validUntil: before_completed']
    )
    expect(completionSchema.safeParse({ ...completion, validUntil: null }).success).toBe(true)
  })
})

describe('edit forms', () => {
  it('edit only what the form owns', () => {
    // The needs are overrides: null leaves what the sessions import derived.
    const needs = {
      requiredForAll: false,
      departmentIds: [],
      positionIds: [],
      sessionMinutes: 180,
      groupSize: null,
      onlineAllowed: null,
      capabilities: [],
    }
    expect(
      courseEditSchema.parse({ name: 'BOZP', validityMonths: 24, code: 'X', ...needs })
    ).toEqual({ name: 'BOZP', validityMonths: 24, ...needs })
    expect(
      issues(
        courseEditSchema.safeParse({
          name: 'BOZP',
          validityMonths: 24,
          ...needs,
          sessionMinutes: 5,
        })
      )
    ).toHaveLength(1)
    const {
      externalId: _id,
      courseCode: _code,
      bookedCount: _booked,
      location: _location,
      ...edit
    } = { ...session, courseId: 'course_bozp', roomId: 'room_aula_a' }
    expect(sessionEditSchema.parse({ ...edit, unnamedBookings: 3 })).not.toHaveProperty(
      'bookedCount'
    )
    // The course is a field like the room: picked by id, never left out.
    expect(sessionEditSchema.safeParse({ ...edit, courseId: '', unnamedBookings: 3 }).success).toBe(
      false
    )
    // Unnamed seats alone cannot outnumber the seats (named ones are counted on the server).
    expect(issues(sessionEditSchema.safeParse({ ...edit, unnamedBookings: 31 }))).toEqual([
      'capacity: over_capacity',
    ])
    expect(sessionEditSchema.safeParse({ ...edit, roomId: '', unnamedBookings: 3 }).success).toBe(
      false
    )
    expect(issues(sessionEditSchema.safeParse({ ...edit, unnamedBookings: -1 }))).toHaveLength(1)
    expect(
      issues(sessionEditSchema.safeParse({ ...edit, unnamedBookings: 0, endTime: '08:00' }))
    ).toEqual(['endTime: before_start'])
  })

  it('apply the same date rules as the records', () => {
    const {
      externalId: _id,
      nationalId: _nid,
      managerEmail: _mgr,
      department: _dept,
      position: _pos,
      ...rest
    } = employee
    const edit = {
      ...rest,
      nationalId: null,
      departmentId: 'dep_lab',
      positionId: null,
      managerId: null,
      leadsDepartment: false,
    }
    expect(employeeEditSchema.safeParse(edit).success).toBe(true)
    expect(issues(employeeEditSchema.safeParse({ ...edit, leftOn: '2010-01-01' }))).toEqual([
      'leftOn: before_hired',
    ])
    // Whoever leads a department is in one.
    expect(employeeEditSchema.safeParse({ ...edit, leadsDepartment: true }).success).toBe(true)
    expect(
      issues(employeeEditSchema.safeParse({ ...edit, departmentId: null, leadsDepartment: true }))
    ).toEqual(['leadsDepartment: no_department'])
    // Leaving is a date, not a status.
    expect(employeeEditSchema.safeParse({ ...edit, status: 'TERMINATED' }).success).toBe(false)

    const create = {
      employeeId: 'emp_1',
      courseId: 'course_bozp',
      completedOn: '2024-11-05',
      validUntil: '2026-11-05',
      providerId: 'prov_1',
      newProviderName: null,
      price: 450,
      note: null,
    }
    expect(completionEditSchema.safeParse(create).success).toBe(true)
    expect(issues(completionEditSchema.safeParse({ ...create, validUntil: '2020-01-01' }))).toEqual(
      ['validUntil: before_completed']
    )
    expect(completionEditSchema.safeParse({ ...create, validUntil: null }).success).toBe(true)
    // A provider is picked or named as new, never both.
    expect(
      completionEditSchema.safeParse({ ...create, providerId: null, newProviderName: 'Nová' })
        .success
    ).toBe(true)
    expect(issues(completionEditSchema.safeParse({ ...create, newProviderName: 'Nová' }))).toEqual([
      'newProviderName: provider_both',
    ])
  })

  it('give a department its head and a position its departments', () => {
    expect(departmentSchema.parse({ name: ' Knihovna ', headId: null })).toEqual({
      name: 'Knihovna',
      headId: null,
    })
    expect(positionSchema.parse({ name: 'Referent', departmentIds: ['a', 'b'] })).toEqual({
      name: 'Referent',
      departmentIds: ['a', 'b'],
    })
    expect(
      issues(positionSchema.safeParse({ name: 'Referent', departmentIds: ['a', 'a'] }))
    ).toEqual(['departmentIds: duplicate'])
  })
})

describe('rooms and new sessions', () => {
  it('take a kind, an optional capacity and known capabilities', () => {
    const room = {
      name: ' Laboratoř 3 ',
      kind: 'LAB',
      capacity: 20,
      capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
      note: null,
    }
    expect(roomSchema.parse(room).name).toBe('Laboratoř 3')
    expect(roomSchema.safeParse({ ...room, kind: 'GARAGE' }).success).toBe(false)
    expect(roomSchema.safeParse({ ...room, capabilities: ['TELEPORT'] }).success).toBe(false)
    expect(
      issues(roomSchema.safeParse({ ...room, capabilities: ['PROJECTOR', 'PROJECTOR'] }))
    ).toEqual(['capabilities: duplicate'])
    // Only an online room goes without seats, and it has no limit whatever was entered.
    expect(issues(roomSchema.safeParse({ ...room, capacity: null }))).toEqual([
      'capacity: required',
    ])
    expect(roomSchema.parse({ ...room, kind: 'ONLINE', capacity: 300 }).capacity).toBeNull()
    expect(roomSchema.safeParse({ ...room, capacity: 0 }).success).toBe(false)
    // null equipment: leave it as it is (a rooms file without the column).
    expect(roomSchema.parse({ ...room, capabilities: null }).capabilities).toBeNull()
  })

  it('create a session for a course in a room, ending after it starts', () => {
    const create = {
      courseId: 'course_bozp',
      date: '2026-11-18',
      startTime: '08:00',
      endTime: '11:00',
      roomId: 'room_aula_a',
      capacity: 30,
      pricePerPerson: null,
      status: 'PLANNED',
    }
    expect(sessionCreateSchema.parse(create).roomId).toBe('room_aula_a')
    expect(issues(sessionCreateSchema.safeParse({ ...create, endTime: '07:00' }))).toEqual([
      'endTime: before_start',
    ])
    // A new session opens at least one seat.
    expect(sessionCreateSchema.safeParse({ ...create, capacity: 0 }).success).toBe(false)
  })
})

describe('providers', () => {
  const provider = {
    name: ' Vzorový školicí ústav ',
    companyId: '002 16 224',
    email: 'kurzy@vzor.example',
    phone: '+420 549 49 1111',
    website: 'www.vzor.example',
    note: null,
  }

  it('take a name and optional, checked details', () => {
    expect(providerSchema.parse(provider)).toEqual({
      ...provider,
      name: 'Vzorový školicí ústav',
      companyId: '00216224',
      website: 'https://www.vzor.example',
    })
    expect(
      providerSchema.parse({
        name: 'Interní školitel',
        companyId: null,
        email: null,
        phone: null,
        website: null,
        note: null,
      }).name
    ).toBe('Interní školitel')
    expect(
      providerSchema.parse({ ...provider, website: 'http://vzor.example/kurzy' }).website
    ).toBe('http://vzor.example/kurzy')
  })

  it('refuse a bad IČO, email, phone or website', () => {
    expect(issues(providerSchema.safeParse({ ...provider, companyId: '00216225' }))).toEqual([
      'companyId: company_id',
    ])
    expect(providerSchema.safeParse({ ...provider, email: 'kurzy' }).success).toBe(false)
    expect(providerSchema.safeParse({ ...provider, phone: 'call us' }).success).toBe(false)
    expect(providerSchema.safeParse({ ...provider, website: 'ftp://vzor.example' }).success).toBe(
      false
    )
    expect(providerSchema.safeParse({ ...provider, name: ' ' }).success).toBe(false)
  })
})
