import { describe, expect, it } from 'vitest'

import {
  forecastEnd,
  forecastMonths,
  planAssignments,
  type AdvisorInput,
  type AdvisorNeed,
  type AdvisorPlan,
  type AdvisorSession,
} from './advisor'

const AS_OF = '2026-10-16'

let nextSession = 1
function session(courseCode: string, date: string, extra: Partial<AdvisorSession> = {}) {
  const id = `T${String(nextSession++).padStart(3, '0')}`
  return {
    externalId: id,
    courseCode,
    courseName: `Course ${courseCode}`,
    room: { id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM' },
    // 09:00–12:00 Prague (UTC+2 until 25 Oct, +1 after) — the exact hour only matters for clashes.
    startsAt: `${date}T07:00:00.000Z`,
    endsAt: `${date}T10:00:00.000Z`,
    capacity: 10,
    unnamedBookings: 0,
    assigned: [],
    pricePerPerson: 500,
    status: 'PLANNED',
    ...extra,
  } satisfies AdvisorSession
}

function need(
  employee: string,
  courseCode: string,
  status: AdvisorNeed['status'],
  extra: { validUntil?: string | null; name?: string; leave?: boolean } = {}
): AdvisorNeed {
  return {
    employee: {
      externalId: employee,
      name: extra.name ?? `Person ${employee}`,
      department: 'Laboratoře',
      status: extra.leave ? 'PARENTAL_LEAVE' : 'ACTIVE',
    },
    course: { code: courseCode, name: `Course ${courseCode}` },
    status,
    validUntil:
      extra.validUntil !== undefined
        ? extra.validUntil
        : status === 'MISSING'
          ? null
          : '2026-10-01',
  }
}

const plan = (needs: AdvisorNeed[], sessions: AdvisorSession[]) =>
  planAssignments({ asOf: AS_OF, needs, sessions } satisfies AdvisorInput)

const itemOf = (p: AdvisorPlan, employee: string, course = 'BOZP') => {
  const item = p.items.find(
    i => i.need.employee.externalId === employee && i.need.course.code === course
  )
  if (!item) throw new Error(`no item for ${employee}/${course}`)
  return item
}

/** "E1→T001" for each proposed session, in queue order. */
const proposed = (p: AdvisorPlan) =>
  p.items.flatMap(i =>
    i.proposal?.kind === 'SESSION'
      ? [`${i.need.employee.externalId}→${i.proposal.session.externalId}`]
      : []
  )

describe('scope and buckets', () => {
  it('forecasts six months, the current one included', () => {
    expect(forecastEnd(AS_OF)).toBe('2027-03-31')
    expect(forecastMonths(AS_OF)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ])
  })

  it('puts lapsed trainings in "now" and the rest in the month they lapse', () => {
    const p = plan(
      [
        need('E1', 'BOZP', 'EXPIRED'),
        need('E2', 'BOZP', 'MISSING'),
        // Valid through 31 Oct: the first day without it is 1 Nov.
        need('E3', 'BOZP', 'EXPIRING', { validUntil: '2026-10-31' }),
        need('E4', 'BOZP', 'VALID', { validUntil: '2027-03-30' }),
        need('E5', 'BOZP', 'VALID', { validUntil: '2027-03-31' }), // lapses in April: out
        need('E6', 'BOZP', 'EXPIRED', { leave: true }), // parental leave: out
      ],
      []
    )
    expect(p.items.map(i => [i.need.employee.externalId, i.bucket, i.lapses])).toEqual([
      ['E1', 'now', '2026-10-02'],
      ['E2', 'now', null],
      ['E3', '2026-11', '2026-11-01'],
      ['E4', '2027-03', '2027-03-31'],
    ])
  })

  it('keeps empty months in the breakdown, and its counts add up to the items', () => {
    const p = plan(
      [
        need('E1', 'BOZP', 'EXPIRED'),
        need('E2', 'BOZP', 'EXPIRING', { validUntil: '2026-11-10' }),
        need('E3', 'BOZP', 'VALID', { validUntil: '2026-12-31' }),
      ],
      [session('BOZP', '2026-12-10', { assigned: ['E3'] })]
    )
    expect(p.breakdown.map(r => r.bucket)).toEqual(['now', ...forecastMonths(AS_OF)])
    expect(p.breakdown.find(r => r.bucket === '2026-11')?.counts).toEqual({
      PLANNED: 0,
      PLANNED_LATE: 0,
      ACTION_REQUIRED: 1,
    })
    expect(p.breakdown.find(r => r.bucket === '2027-01')?.counts.PLANNED).toBe(1)
    expect(p.breakdown.find(r => r.bucket === '2027-02')?.total).toBe(0)
    expect(p.breakdown.reduce((n, r) => n + r.total, 0)).toBe(p.items.length)
    expect(p.totals).toEqual({ now: 1, upcoming: 2, planned: 1, actionRequired: 2, proposed: 2 })
  })
})

describe('remediation and the non-compliance window', () => {
  it('a booking that ends before the lapse leaves no window', () => {
    const s = session('BOZP', '2026-12-10', { assigned: ['E1'] })
    const item = itemOf(
      plan([need('E1', 'BOZP', 'VALID', { validUntil: '2026-12-31' })], [s]),
      'E1'
    )
    expect(item).toMatchObject({ remediation: 'PLANNED', window: null, proposal: null })
    expect(item.booked?.externalId).toBe(s.externalId)
  })

  it('a booking after the lapse is planned late, with the gap in days', () => {
    const s = session('BOZP', '2026-12-10', { assigned: ['E1'] })
    const item = itemOf(
      plan([need('E1', 'BOZP', 'VALID', { validUntil: '2026-11-30' })], [s]),
      'E1'
    )
    expect(item.remediation).toBe('PLANNED_LATE')
    expect(item.window).toEqual({ from: '2026-12-01', until: '2026-12-10', days: 9 })
  })

  it('a lapsed training that is booked counts the window from the lapse', () => {
    const s = session('BOZP', '2026-11-04', { assigned: ['E1', 'E2'] })
    const p = plan([need('E1', 'BOZP', 'EXPIRED'), need('E2', 'BOZP', 'MISSING')], [s])
    expect(itemOf(p, 'E1').window).toEqual({ from: '2026-10-02', until: '2026-11-04', days: 33 })
    // Never held: the start is unknown, so only the end is given.
    expect(itemOf(p, 'E2')).toMatchObject({
      remediation: 'PLANNED_LATE',
      window: { from: null, until: '2026-11-04', days: null },
    })
  })

  it('without a booking, action is required and the window is open', () => {
    const cancelled = session('BOZP', '2026-11-04', { assigned: ['E1'], status: 'CANCELLED' })
    const item = itemOf(plan([need('E1', 'BOZP', 'EXPIRED')], [cancelled]), 'E1')
    expect(item).toMatchObject({
      remediation: 'ACTION_REQUIRED',
      booked: null,
      window: { from: '2026-10-02', until: null, days: null },
    })
  })
})

describe('the queue', () => {
  const needs = [
    need('E5', 'BOZP', 'VALID', { validUntil: '2027-01-15' }),
    need('E4', 'BOZP', 'EXPIRING', { validUntil: '2026-10-20' }),
    need('E3', 'BOZP', 'MISSING', { name: 'Adámek Petr' }),
    need('E6', 'BOZP', 'MISSING', { name: 'Čermák Jan' }),
    need('E2', 'BOZP', 'EXPIRED', { validUntil: '2026-09-01' }),
    need('E1', 'BOZP', 'EXPIRED', { validUntil: '2026-06-01' }),
  ]
  const sessions = [session('BOZP', '2026-11-04', { capacity: 20 })]

  it('serves the longest expired first, then never completed, then the soonest to lapse', () => {
    const p = plan(needs, sessions)
    expect(p.items.map(i => [i.need.employee.externalId, i.proposal?.rank])).toEqual([
      ['E1', 1],
      ['E2', 2],
      ['E3', 3],
      ['E6', 4],
      ['E4', 5],
      ['E5', 6],
    ])
  })

  it('gives the same plan whatever order the input arrives in', () => {
    const reference = plan(needs, sessions)
    for (const order of [
      needs.toReversed(),
      [needs[2], needs[0], needs[5], needs[1], needs[4], needs[3]],
    ])
      expect(
        plan(
          order.filter(n => n !== undefined),
          sessions
        )
      ).toEqual(reference)
  })

  it('leaves remedied trainings out of the queue', () => {
    const p = plan(
      [need('E1', 'BOZP', 'EXPIRED'), need('E2', 'BOZP', 'EXPIRED')],
      [session('BOZP', '2026-11-04', { assigned: ['E1'] })]
    )
    expect(itemOf(p, 'E1').proposal).toBeNull()
    expect(itemOf(p, 'E2').proposal).toMatchObject({ kind: 'SESSION', rank: 1 })
  })
})

describe('session choice', () => {
  it('sends a lapsed training to the earliest session', () => {
    const later = session('BOZP', '2026-12-10')
    const soon = session('BOZP', '2026-11-04')
    expect(proposed(plan([need('E1', 'BOZP', 'EXPIRED')], [later, soon]))).toEqual([
      `E1→${soon.externalId}`,
    ])
  })

  it('retrains a lapsing training in the last session that still ends in time', () => {
    const early = session('BOZP', '2026-11-05')
    const inTime = session('BOZP', '2026-12-10')
    const late = session('BOZP', '2027-01-20')
    const p = plan(
      [need('E1', 'BOZP', 'VALID', { validUntil: '2026-12-31' })],
      [late, early, inTime]
    )
    expect(proposed(p)).toEqual([`E1→${inTime.externalId}`])
    expect(itemOf(p, 'E1').proposal).toMatchObject({ window: null })
  })

  it('takes the earliest late session when none ends in time, and shows the gap', () => {
    const first = session('BOZP', '2026-11-20')
    const second = session('BOZP', '2026-12-10')
    const p = plan([need('E1', 'BOZP', 'EXPIRING', { validUntil: '2026-11-01' })], [second, first])
    expect(proposed(p)).toEqual([`E1→${first.externalId}`])
    expect(itemOf(p, 'E1').proposal).toMatchObject({
      window: { from: '2026-11-02', until: '2026-11-20', days: 18 },
    })
  })

  it('never fills a session past capacity', () => {
    const one = session('BOZP', '2026-11-04', { capacity: 2, unnamedBookings: 1 })
    const p = plan(
      [need('E1', 'BOZP', 'EXPIRED'), need('E2', 'BOZP', 'EXPIRED', { validUntil: '2026-10-05' })],
      [one]
    )
    expect(proposed(p)).toEqual([`E1→${one.externalId}`])
    expect(itemOf(p, 'E2').proposal).toMatchObject({ kind: 'NONE', reason: 'NO_SEATS' })
  })

  it('never proposes overlapping sessions for one person', () => {
    const bozp = session('BOZP', '2026-11-04')
    const gdpr = session('GDPR', '2026-11-04')
    const gdprLater = session('GDPR', '2026-11-11')
    const p = plan(
      [need('E1', 'BOZP', 'EXPIRED'), need('E1', 'GDPR', 'EXPIRED')],
      [bozp, gdpr, gdprLater]
    )
    expect(proposed(p)).toEqual([`E1→${bozp.externalId}`, `E1→${gdprLater.externalId}`])
  })

  it('names the reason when no session can be proposed', () => {
    const full = session('PRV', '2026-11-04', { capacity: 1, unnamedBookings: 1 })
    const clash = session('GDPR', '2026-11-04')
    const busy = session('KYBER', '2026-11-04', { assigned: ['E3'] })
    const p = plan(
      [need('E1', 'ANGL', 'MISSING'), need('E2', 'PRV', 'MISSING'), need('E3', 'GDPR', 'MISSING')],
      [full, clash, busy]
    )
    expect(itemOf(p, 'E1', 'ANGL').proposal).toMatchObject({ reason: 'NO_SESSION' })
    expect(itemOf(p, 'E2', 'PRV').proposal).toMatchObject({ reason: 'NO_SEATS' })
    expect(itemOf(p, 'E3', 'GDPR').proposal).toMatchObject({ reason: 'CONFLICT' })
    // Clashes are personal; only missing sessions or seats call for another session.
    expect(p.shortfall.map(s => [s.courseCode, s.people])).toEqual([
      ['ANGL', 1],
      ['PRV', 1],
    ])
  })

  it('prices the proposals', () => {
    const p = plan(
      [need('E1', 'BOZP', 'EXPIRED'), need('E2', 'GDPR', 'MISSING')],
      [
        session('BOZP', '2026-11-04', { pricePerPerson: 450 }),
        session('GDPR', '2026-11-12', { pricePerPerson: null }),
      ]
    )
    expect(p.cost).toBe(450)
  })
})

describe('overbooking', () => {
  it('moves anonymous seats to sessions of the same course with room, earliest first', () => {
    const over = session('BOZP', '2026-11-02', { capacity: 30, unnamedBookings: 33 })
    const full = session('BOZP', '2026-11-05', { capacity: 10, unnamedBookings: 10 })
    const soon = session('BOZP', '2026-11-09', { capacity: 10, unnamedBookings: 9 })
    const later = session('BOZP', '2026-12-09', { capacity: 10 })
    const other = session('GDPR', '2026-11-05')
    const p = plan([], [later, other, over, full, soon])
    expect(p.overbooked).toHaveLength(1)
    const [o] = p.overbooked
    expect(o).toMatchObject({ excess: 3, remaining: 0 })
    expect(o?.moves.map(m => [m.to.externalId, m.count])).toEqual([
      [soon.externalId, 1],
      [later.externalId, 2],
    ])
  })

  it('cannot move named bookings, and says how many seats stay over', () => {
    const over = session('BOZP', '2026-11-02', {
      capacity: 1,
      unnamedBookings: 0,
      assigned: ['E1', 'E2'],
    })
    const room = session('BOZP', '2026-11-09')
    const p = plan([], [over, room])
    expect(p.overbooked[0]).toMatchObject({ excess: 1, moves: [], remaining: 1 })
  })

  it('does not hand the moved seats to the plan', () => {
    const over = session('BOZP', '2026-11-02', { capacity: 2, unnamedBookings: 4 })
    const room = session('BOZP', '2026-11-09', { capacity: 3 })
    const p = plan([need('E1', 'BOZP', 'MISSING'), need('E2', 'BOZP', 'MISSING')], [over, room])
    expect(p.overbooked[0]?.moves[0]?.count).toBe(2)
    expect(proposed(p)).toEqual([`E1→${room.externalId}`])
    expect(itemOf(p, 'E2').proposal).toMatchObject({ reason: 'NO_SEATS' })
  })
})
