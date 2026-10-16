import { describe, expect, it } from 'vitest'

import {
  advisorSettingsSchema,
  DEFAULT_ADVISOR_SETTINGS,
  planAssignments,
  settingsToQuery,
  type AdvisorInput,
  type AdvisorNeed,
  type AdvisorSession,
  type AdvisorSettings,
} from './advisor'

const AS_OF = '2026-10-16'

let nextSession = 1
function session(courseCode: string, date: string, extra: Partial<AdvisorSession> = {}) {
  const id = `T${String(nextSession++).padStart(3, '0')}`
  return {
    externalId: id,
    courseCode,
    courseName: `Course ${courseCode}`,
    location: 'Aula A',
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
  extra: { validUntil?: string | null; department?: string | null; leave?: boolean } = {}
): AdvisorNeed {
  return {
    employee: {
      externalId: employee,
      name: `Person ${employee}`,
      department: extra.department ?? 'Laboratoře',
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

function input(needs: AdvisorNeed[], sessions: AdvisorSession[]): AdvisorInput {
  return {
    asOf: AS_OF,
    expiringWithinDays: 30,
    needs,
    sessions,
    activeCounts: { VALID: 90, EXPIRING: 0, EXPIRED: 5, MISSING: 5, total: 100 },
  }
}

const plan = (i: AdvisorInput, settings: Partial<AdvisorSettings> = {}) =>
  planAssignments(i, { ...DEFAULT_ADVISOR_SETTINGS, ...settings })

const pairs = (p: ReturnType<typeof plan>) =>
  p.suggestions.map(s => `${s.need.employee.externalId}→${s.session.externalId}`)

/** A deterministic shuffle (no Math.random in tests). */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let state = seed
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

describe('priority and order', () => {
  it('serves expired, then missing, then expiring needs with the default weights', () => {
    const s = session('BOZP', '2026-11-02', { capacity: 2 })
    const p = plan(
      input(
        [
          need('E3', 'BOZP', 'EXPIRING', { validUntil: '2026-11-10' }),
          need('E2', 'BOZP', 'MISSING'),
          need('E1', 'BOZP', 'EXPIRED'),
        ],
        [s]
      )
    )
    expect(pairs(p)).toEqual([`E1→${s.externalId}`, `E2→${s.externalId}`])
    expect(p.unresolved).toEqual([expect.objectContaining({ reason: 'NO_SEATS' })])
    expect(p.unresolved[0]?.need.employee.externalId).toBe('E3')
  })

  it('lets the weights reorder the queue', () => {
    const s = session('BOZP', '2026-11-02', { capacity: 1 })
    const needs = [need('E1', 'BOZP', 'EXPIRED'), need('E2', 'BOZP', 'MISSING')]
    expect(pairs(plan(input(needs, [s])))[0]).toMatch(/^E1/)
    expect(pairs(plan(input(needs, [s]), { weightMissing: 150 }))[0]).toMatch(/^E2/)
  })

  it('raises an expiring need as its expiry approaches (the ramp)', () => {
    const s = session('BOZP', '2026-11-02', { capacity: 1 })
    const soon = need('E1', 'BOZP', 'EXPIRING', { validUntil: '2026-10-20' }) // 4 days left
    const later = need('E2', 'BOZP', 'EXPIRING', { validUntil: '2026-11-14' }) // 29 days left
    const p = plan(input([later, soon], [s]))
    expect(pairs(p)).toEqual([`E1→${s.externalId}`])
    expect(p.suggestions[0]?.terms).toContainEqual({ key: 'expiryRamp', value: 26 })
  })

  it('gives the same plan whatever order the input arrives in', () => {
    const sessions = [
      session('BOZP', '2026-11-02', { capacity: 3 }),
      session('BOZP', '2026-12-02', { capacity: 3 }),
      session('GDPR', '2026-11-05', { capacity: 2 }),
    ]
    const needs = [
      ...['E1', 'E2', 'E3', 'E4', 'E5'].map(e => need(e, 'BOZP', 'MISSING')),
      need('E6', 'BOZP', 'EXPIRED', { department: null }),
      need('E1', 'GDPR', 'EXPIRED'),
      need('E2', 'GDPR', 'EXPIRING', { validUntil: '2026-10-30' }),
      need('E7', 'GDPR', 'MISSING'),
    ]
    const reference = pairs(plan(input(needs, sessions)))
    for (const seed of [1, 2, 3, 4, 5])
      expect(pairs(plan(input(shuffled(needs, seed), shuffled(sessions, seed + 9))))).toEqual(
        reference
      )
  })
})

describe('session choice', () => {
  it('prefers the sooner session, by the wait penalty', () => {
    const early = session('BOZP', '2026-10-26')
    const late = session('BOZP', '2027-01-26')
    const p = plan(input([need('E1', 'BOZP', 'MISSING')], [late, early]), { fillPreference: 0 })
    expect(p.suggestions[0]?.session.externalId).toBe(early.externalId)
  })

  it('avoids a session after the training expires, by the late penalty', () => {
    const afterExpiry = session('BOZP', '2026-11-05') // expiry is 11-01
    const before = session('BOZP', '2026-10-30', { unnamedBookings: 9 })
    const n = need('E1', 'BOZP', 'EXPIRING', { validUntil: '2026-11-01' })
    // With the penalty off, the emptier later session wins on fill preference (negative = spread).
    expect(
      plan(input([n], [afterExpiry, before]), {
        lateAfterExpiryPenalty: 0,
        fillPreference: -20,
        waitPenalty: 0,
      }).suggestions[0]?.session.externalId
    ).toBe(afterExpiry.externalId)
    const p = plan(input([n], [afterExpiry, before]), { fillPreference: -20, waitPenalty: 0 })
    expect(p.suggestions[0]?.session.externalId).toBe(before.externalId)
  })

  it('packs or spreads by the fill preference', () => {
    const busy = session('BOZP', '2026-11-02', { unnamedBookings: 8 })
    const empty = session('BOZP', '2026-11-02', {
      unnamedBookings: 0,
      startsAt: '2026-11-02T12:00:00.000Z',
      endsAt: '2026-11-02T14:00:00.000Z',
    })
    const n = [need('E1', 'BOZP', 'MISSING')]
    expect(
      plan(input(n, [busy, empty]), { fillPreference: 20 }).suggestions[0]?.session.externalId
    ).toBe(busy.externalId)
    expect(
      plan(input(n, [busy, empty]), { fillPreference: -20 }).suggestions[0]?.session.externalId
    ).toBe(empty.externalId)
  })

  it('explains every score: the terms add up to it', () => {
    const sessions = [
      session('BOZP', '2026-10-30'),
      session('BOZP', '2026-12-30', { unnamedBookings: 4 }),
    ]
    const needs = [
      need('E1', 'BOZP', 'EXPIRING', { validUntil: '2026-11-20' }),
      need('E2', 'BOZP', 'EXPIRED'),
      need('E3', 'BOZP', 'MISSING'),
    ]
    for (const s of plan(input(needs, sessions)).suggestions) {
      expect(s.terms.reduce((n, t) => n + t.value, 0)).toBeCloseTo(s.score, 9)
      expect(s.terms[0]?.key).toBe('urgency')
    }
  })
})

describe('hard limits', () => {
  it('never books past capacity × maxFill, and never into an overbooked session', () => {
    const sessions = [
      session('BOZP', '2026-11-02', { capacity: 10, unnamedBookings: 6 }),
      session('BOZP', '2026-11-09', { capacity: 4, unnamedBookings: 5, assigned: [] }), // overbooked, nothing movable fits
    ]
    const needs = Array.from({ length: 20 }, (_, i) =>
      need(`E${String(i + 10)}`, 'BOZP', 'MISSING')
    )
    for (const maxFill of [100, 80, 50]) {
      const p = plan(input(needs, sessions), { maxFill })
      const perSession = Map.groupBy(p.suggestions, s => s.session.externalId)
      for (const s of sessions) {
        const added = perSession.get(s.externalId)?.length ?? 0
        const limit = Math.floor((s.capacity * maxFill) / 100)
        const before = s.unnamedBookings
        expect(before + added <= Math.max(limit, before)).toBe(true)
        if (before >= limit) expect(added).toBe(0)
      }
    }
  })

  it('never plans one person into overlapping sessions', () => {
    const a = session('BOZP', '2026-11-02')
    const b = session('GDPR', '2026-11-02') // same hours
    const c = session('GDPR', '2026-11-03')
    const p = plan(input([need('E1', 'BOZP', 'EXPIRED'), need('E1', 'GDPR', 'EXPIRED')], [a, b, c]))
    expect(pairs(p)).toEqual([`E1→${a.externalId}`, `E1→${c.externalId}`])
  })

  it('reports a clash when the only session overlaps a booking', () => {
    const booked = session('BOZP', '2026-11-02', { assigned: ['E1'] })
    const clash = session('GDPR', '2026-11-02')
    const p = plan(input([need('E1', 'GDPR', 'EXPIRED')], [booked, clash]))
    expect(p.unresolved).toEqual([expect.objectContaining({ reason: 'CONFLICT' })])
  })

  it('caps the sessions planned per person', () => {
    const sessions = ['A', 'B', 'C'].map((c, i) => session(c, `2026-11-0${String(i + 2)}`))
    const needs = ['A', 'B', 'C'].map(c => need('E1', c, 'MISSING'))
    const p = plan(input(needs, sessions), { maxPerEmployee: 2 })
    expect(p.suggestions).toHaveLength(2)
    expect(p.unresolved).toEqual([expect.objectContaining({ reason: 'LIMIT' })])
  })
})

describe('what is in play', () => {
  it('names the reason a need stays open', () => {
    const far = session('FAR', '2027-09-01')
    const cancelled = session('GONE', '2026-11-02', { status: 'CANCELLED' })
    const full = session('FULL', '2026-11-02', { capacity: 0 })
    const p = plan(
      input(
        [
          need('E1', 'FAR', 'MISSING'),
          need('E2', 'GONE', 'MISSING'),
          need('E3', 'FULL', 'MISSING'),
          need('E4', 'NONE', 'MISSING'),
        ],
        [far, cancelled, full]
      )
    )
    const reasons = Object.fromEntries(p.unresolved.map(u => [u.need.course.code, u.reason]))
    expect(reasons).toEqual({
      FAR: 'OUTSIDE_HORIZON',
      GONE: 'NO_SESSION',
      FULL: 'NO_SEATS',
      NONE: 'NO_SESSION',
    })
    expect(p.shortfall.map(s => s.courseCode)).toEqual(['FAR', 'FULL', 'GONE', 'NONE'])
  })

  it('treats a named booking as covering the need', () => {
    const s = session('BOZP', '2026-11-02', { assigned: ['E1'] })
    const p = plan(input([need('E1', 'BOZP', 'EXPIRED'), need('E2', 'BOZP', 'EXPIRED')], [s]))
    expect(p.covered.map(n => n.employee.externalId)).toEqual(['E1'])
    expect(pairs(p)).toEqual([`E2→${s.externalId}`])
  })

  it('leaves out expiring needs and parental leave unless asked', () => {
    const s = session('BOZP', '2026-11-02')
    const needs = [
      need('E1', 'BOZP', 'EXPIRING', { validUntil: '2026-11-01' }),
      need('E2', 'BOZP', 'MISSING', { leave: true }),
    ]
    expect(plan(input(needs, [s]), { includeExpiring: false }).suggestions).toHaveLength(0)
    expect(plan(input(needs, [s]), { includeParentalLeave: true }).suggestions).toHaveLength(2)
  })
})

describe('overbooking', () => {
  it('moves anonymous seats to sessions of the same course with room, earliest first', () => {
    const over = session('BOZP', '2026-11-02', { capacity: 30, unnamedBookings: 33 })
    const soon = session('BOZP', '2026-11-09', { capacity: 10, unnamedBookings: 9 })
    const later = session('BOZP', '2026-12-09', { capacity: 10 })
    const other = session('GDPR', '2026-11-05')
    const p = plan(input([], [later, other, over, soon]))
    expect(p.overbooked).toHaveLength(1)
    const [o] = p.overbooked
    expect(o).toMatchObject({ excess: 3, remaining: 0 })
    expect(o?.moves.map(m => [m.to.externalId, m.count])).toEqual([
      [soon.externalId, 1],
      [later.externalId, 2],
    ])
    expect(p.metrics).toMatchObject({ overbookedBefore: 1, overbookedAfter: 0 })
  })

  it('cannot move named bookings, and says how many seats stay over', () => {
    const over = session('BOZP', '2026-11-02', {
      capacity: 1,
      unnamedBookings: 0,
      assigned: ['E1', 'E2'],
    })
    const room = session('BOZP', '2026-11-09')
    const p = plan(input([], [over, room]))
    expect(p.overbooked[0]).toMatchObject({ excess: 1, moves: [], remaining: 1 })
  })

  it('does not hand the moved seats to the plan', () => {
    const over = session('BOZP', '2026-11-02', { capacity: 2, unnamedBookings: 4 })
    const room = session('BOZP', '2026-11-09', { capacity: 3 })
    const p = plan(
      input([need('E1', 'BOZP', 'MISSING'), need('E2', 'BOZP', 'MISSING')], [over, room])
    )
    expect(p.overbooked[0]?.moves[0]?.count).toBe(2)
    expect(pairs(p)).toEqual([`E1→${room.externalId}`])
    expect(p.unresolved).toEqual([expect.objectContaining({ reason: 'NO_SEATS' })])
  })
})

describe('demand', () => {
  it("sets each course's open needs against its free seats", () => {
    const sessions = [
      session('BOZP', '2026-11-02', { capacity: 3, unnamedBookings: 1 }),
      session('BOZP', '2027-09-02', { capacity: 50 }), // beyond the horizon: not on offer
    ]
    const p = plan(
      input(
        [
          need('E1', 'BOZP', 'EXPIRED'),
          need('E2', 'BOZP', 'MISSING'),
          need('E3', 'BOZP', 'MISSING'),
          need('E4', 'GDPR', 'EXPIRED'),
        ],
        sessions
      )
    )
    expect(p.demand).toEqual([
      {
        courseCode: 'BOZP',
        courseName: 'Course BOZP',
        needs: { EXPIRED: 1, MISSING: 2, EXPIRING: 0 },
        freeSeats: 2,
        placed: 2,
      },
      {
        courseCode: 'GDPR',
        courseName: 'Course GDPR',
        needs: { EXPIRED: 1, MISSING: 0, EXPIRING: 0 },
        freeSeats: 0,
        placed: 0,
      },
    ])
  })
})

describe('metrics', () => {
  it('projects compliance, utilisation and cost', () => {
    const s = session('BOZP', '2026-11-02', {
      capacity: 4,
      unnamedBookings: 1,
      pricePerPerson: 450,
    })
    const p = plan(
      input(
        [
          need('E1', 'BOZP', 'EXPIRED'),
          need('E2', 'BOZP', 'EXPIRING', { validUntil: '2026-11-10' }),
        ],
        [s]
      )
    )
    expect(p.metrics).toMatchObject({
      complianceBefore: 0.9,
      complianceAfter: 0.91, // only the expired pair becomes held; expiring was already held
      utilisationBefore: 0.25,
      utilisationAfter: 0.75,
      openBefore: 2,
      openAfter: 0,
      cost: 900,
    })
  })
})

describe('settings', () => {
  it('fills defaults and clamps anything out of range', () => {
    expect(advisorSettingsSchema.parse({})).toEqual(DEFAULT_ADVISOR_SETTINGS)
    expect(
      advisorSettingsSchema.parse({
        weightExpired: '999',
        maxFill: '10',
        fillPreference: 'x',
        includeExpiring: '0',
        waitPenalty: '0.27',
      })
    ).toMatchObject({
      weightExpired: 200,
      maxFill: 50,
      fillPreference: 10,
      includeExpiring: false,
      waitPenalty: 0.3,
    })
  })

  it('round-trips through a URL query that only carries changes', () => {
    const changed = { ...DEFAULT_ADVISOR_SETTINGS, weightMissing: 120, includeParentalLeave: true }
    const query = settingsToQuery(changed)
    expect(query).toEqual({ weightMissing: '120', includeParentalLeave: '1' })
    expect(advisorSettingsSchema.parse(query)).toEqual(changed)
  })
})
