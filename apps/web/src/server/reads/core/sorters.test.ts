import { type ArchivedItem, pageOf, type SortValue, type UserListItem } from '@muni/db/repositories'
import { planAssignments } from '@muni/domain/advisor'
import { planSessions } from '@muni/domain/planner'
import { describe, expect, it, vi } from 'vitest'

import {
  advisorInput,
  booking,
  counts,
  courseRow,
  departmentSummary,
  employeeDetail,
  plannerInput,
  positionSummary,
  providerDetail,
  providerRow,
  roomRow,
  session,
} from '@/test/fixtures'

import {
  advisorKeys,
  archivedKeys,
  bookingKeys,
  completionKeys,
  courseKeys,
  departmentKeys,
  historyKeys,
  offerKeys,
  positionKeys,
  providerCourseKeys,
  providerKeys,
  roomKeys,
  sessionKeys,
  userKeys,
} from './sorters'

vi.mock('server-only', () => ({}))

const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' })
const missing = (v: SortValue) => v === null || v === undefined || v === ''
const compare = (a: SortValue, b: SortValue) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b))

/**
 * Every column of a list, both ways: the rows come back in the order of the value the column
 * shows, the ones without a value last.
 */
function expectEveryColumnSorts<T>(rows: T[], keys: Record<string, (row: T) => SortValue>) {
  for (const [key, valueOf] of Object.entries(keys)) {
    for (const desc of [false, true]) {
      const values = pageOf(rows, { sort: { by: key, desc }, pageSize: 100 }, keys).items.map(
        valueOf
      )
      const present = values.filter(v => !missing(v))
      expect(values.slice(0, present.length), `${key}: missing values last`).toEqual(present)
      for (let i = 1; i < present.length; i++) {
        const order = compare(present[i - 1], present[i])
        expect(desc ? order >= 0 : order <= 0, `${key} ${desc ? 'desc' : 'asc'}`).toBe(true)
      }
    }
  }
}

const archived = (over: Partial<ArchivedItem>): ArchivedItem => ({
  id: 'a',
  label: null,
  detail: null,
  when: null,
  tag: '000000',
  archivedAt: '2026-10-01T10:00:00.000Z',
  archivedBy: null,
  ...over,
})

const user = (over: Partial<UserListItem>): UserListItem => ({
  id: 'u',
  clerkId: 'c',
  email: null,
  name: null,
  role: 'VIEWER',
  lastSignInAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('every list sorts on the server by the value its column shows', () => {
  it('courses, departments, positions, providers and rooms', () => {
    expectEveryColumnSorts(
      [
        courseRow({ name: 'Účetnictví', validityMonths: null, completionCount: 3 }),
        courseRow({ name: 'Chemie', validityMonths: 12, counts: counts({ VALID: 1 }), rate: 1 }),
        courseRow({ name: 'Cvičení', validityMonths: 24, counts: counts({}), upcomingSessions: 2 }),
      ],
      courseKeys
    )
    expectEveryColumnSorts(
      [
        departmentSummary({ name: 'Výroba', head: null, active: 4 }),
        departmentSummary({ name: 'Archiv', active: 1, actionNow: 3 }),
      ],
      departmentKeys
    )
    expectEveryColumnSorts(
      [
        positionSummary({ name: 'Referent', departments: [] }),
        positionSummary({ name: 'Laborant', active: 9, upcomingBookings: 2 }),
      ],
      positionKeys
    )
    expectEveryColumnSorts(
      [
        providerRow({ name: 'Zeta', companyId: null, spend: null, lastCompletedOn: null }),
        providerRow({ name: 'Alfa', completions: 9, spend: 1200, lastCompletedOn: '2026-01-02' }),
      ],
      providerKeys
    )
    expectEveryColumnSorts(
      [
        roomRow({ name: 'Online', kind: 'ONLINE', capacity: null, utilisation: null }),
        roomRow({ name: 'Aula', capacity: 40, utilisation: 0.5, upcomingSessions: 3 }),
        roomRow({ name: 'Učebna 2', capacity: 12, utilisation: 0.1 }),
      ],
      roomKeys
    )
  })

  it('users, admins first by role, and archived records, people by their tag', () => {
    const users = [
      user({ id: '1', name: 'Bára', role: 'VIEWER', email: 'b@x.cz' }),
      user({ id: '2', name: 'Adam', role: 'ADMIN', lastSignInAt: '2026-10-01T10:00:00.000Z' }),
      user({ id: '3', name: null, role: 'FULL', email: 'c@x.cz' }),
    ]
    expectEveryColumnSorts(users, userKeys)
    const byRole = pageOf(users, { sort: { by: 'role', desc: false } }, userKeys)
    expect(byRole.items.map(u => u.role)).toEqual(['ADMIN', 'FULL', 'VIEWER'])

    const records = [
      archived({ id: '1', tag: 'ffee00', archivedAt: '2026-10-03T10:00:00.000Z' }),
      archived({
        id: '2',
        label: 'BOZP-Z',
        when: { key: 'startsAt', value: '2026-11-04', type: 'datetime' },
      }),
      archived({ id: '3', tag: '00aa11' }),
    ]
    expectEveryColumnSorts(records, archivedKeys)
    const byName = pageOf(records, { sort: { by: 'name', desc: false } }, archivedKeys)
    expect(byName.items.map(i => i.label ?? `~${i.tag}`)).toEqual(['~00aa11', '~ffee00', 'BOZP-Z'])
  })

  it('sessions, completions and a provider’s courses, wherever they are listed', () => {
    expectEveryColumnSorts(
      [
        session({ externalId: 'T1', courseName: 'Účetnictví', pricePerPerson: null }),
        session({ externalId: 'T2', startsAt: '2026-12-01T08:00:00.000Z', capacity: 0 }),
        session({ externalId: 'T3', status: 'CANCELLED', bookedCount: 3, capacity: 10 }),
      ],
      sessionKeys
    )
    const detail = providerDetail()
    expectEveryColumnSorts(detail.completionList, completionKeys)
    expectEveryColumnSorts(detail.byCourse, providerCourseKeys)
    expectEveryColumnSorts(employeeDetail().completions, historyKeys)
    expectEveryColumnSorts(
      [
        booking({ person: { externalId: 'E2', name: 'Žák Jan' } }),
        booking({
          sessionExternalId: 'T1',
          courseName: 'Angličtina',
          startsAt: '2026-11-01T08:00:00.000Z',
          room: { id: 'r', name: 'Online', kind: 'ONLINE' },
        }),
      ],
      bookingKeys
    )
  })

  it('what has nothing required, an archived person and a booked training', () => {
    const none = counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 })
    const courses = [
      courseRow({ code: 'A', name: 'Angličtina', counts: none, rate: 0 }),
      courseRow({ code: 'B', name: 'BOZP', rate: 0.5 }),
    ]
    expectEveryColumnSorts(courses, courseKeys)
    // Nothing required: no rate at all, not 0 %.
    const byRate = pageOf(courses, { sort: { by: 'compliance', desc: true } }, courseKeys)
    expect(byRate.items.map(c => c.code)).toEqual(['B', 'A'])

    const departments = [
      departmentSummary({ id: 'd1', name: 'Archiv', counts: none, rate: 0 }),
      departmentSummary({ id: 'd2', name: 'Výroba', head: { archived: true, tag: 'aa11' } }),
    ]
    expectEveryColumnSorts(departments, departmentKeys)
    expect(departmentKeys.head(departments[1] ?? departmentSummary())).toBe('~aa11')
    expect(departmentKeys.compliance(departments[0] ?? departmentSummary())).toBeNull()

    const [first] = providerDetail().completionList
    if (!first) throw new Error('fixture')
    expectEveryColumnSorts(
      [first, { ...first, employee: { archived: true as const, tag: 'bb22' } }],
      completionKeys
    )

    // Černá Marie is booked on T016 by name; Adámek Petr is not booked at all.
    const [t016, t018] = advisorInput().sessions
    if (!t016 || !t018) throw new Error('fixture')
    const plan = planAssignments(
      advisorInput({ sessions: [{ ...t016, assigned: ['E0153'], unnamedBookings: 0 }, t018] })
    )
    expectEveryColumnSorts(plan.items, advisorKeys)
    const byBooked = pageOf(plan.items, { sort: { by: 'booked', desc: false } }, advisorKeys)
    expect(byBooked.items.map(i => i.booked?.externalId ?? null)).toEqual(['T016', null])
  })

  it('the advisor’s tables and the planner’s offers', () => {
    const plan = planAssignments(advisorInput())
    expectEveryColumnSorts(plan.items, advisorKeys)
    const offers = planSessions({
      asOf: advisorInput().asOf,
      items: plan.items,
      ...plannerInput(),
    })
    expectEveryColumnSorts(offers, offerKeys)
  })
})
