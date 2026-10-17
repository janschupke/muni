import { describe, expect, it } from 'vitest'

import type { PlanItem, UnplacedReason } from './advisor'
import {
  DEFAULT_SESSION_MINUTES,
  groupOffers,
  type PlannerCourse,
  type PlannerInput,
  type PlannerSession,
  planSessions,
} from './planner'
import type { RoomFacts } from './rooms'

// 2026-10-16 is a Friday: tomorrow is Saturday, so the first working day is Monday the 19th.
const asOf = '2026-10-16'

const course = (over: Partial<PlannerCourse> = {}): PlannerCourse => ({
  id: 'course_bozp',
  code: 'BOZP-Z',
  name: 'BOZP – základní školení',
  sessionMinutes: 180,
  groupSize: 2,
  onlineAllowed: false,
  capabilities: [],
  usualStart: '08:00',
  heldIn: [],
  ...over,
})

const room = (over: Partial<RoomFacts> & { id: string }): RoomFacts => ({
  name: over.id,
  kind: 'CLASSROOM',
  capacity: 30,
  capabilities: [],
  ...over,
})

let serial = 0
function unplaced(
  name: string,
  {
    code = 'BOZP-Z',
    bucket = 'now',
    lapses = null,
    reason = 'NO_SESSION',
  }: { code?: string; bucket?: string; lapses?: string | null; reason?: UnplacedReason } = {}
): PlanItem {
  serial++
  return {
    need: {
      employee: {
        externalId: `E${String(serial).padStart(4, '0')}`,
        name,
        department: 'Laboratoře',
        departmentId: 'd-lab',
        positionId: 'p-lab',
        status: 'ACTIVE',
      },
      course: { code, name: code },
      status: lapses === null ? 'MISSING' : 'EXPIRING',
      validUntil: null,
    },
    bucket,
    lapses,
    booked: null,
    remediation: 'ACTION_REQUIRED',
    window: null,
    proposal: { kind: 'NONE', rank: serial, reason },
  }
}

const input = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  asOf,
  items: [],
  courses: [course()],
  rooms: [room({ id: 'aula', name: 'Aula A' })],
  sessions: [],
  ...over,
})

const busyAllDay = (roomId: string, date: string): PlannerSession => ({
  roomId,
  startsAt: `${date}T00:00:00.000Z`,
  endsAt: `${date}T23:00:00.000Z`,
})

describe('planSessions: demand', () => {
  it('groups what is due by course and month, splits it into sessions, earliest lapse first', () => {
    const offers = planSessions(
      input({
        items: [
          unplaced('Cibulka Ota', { bucket: '2026-12', lapses: '2026-12-10' }),
          unplaced('Adámek Petr'),
          unplaced('Bílá Jana', { reason: 'NO_SEATS' }),
          unplaced('Dvořák Jan'),
          unplaced('Eliáš Karel', { bucket: '2026-12', lapses: '2026-12-03' }),
        ],
      })
    )
    expect(
      offers.map(o => [o.id, o.deadline, o.size, o.people.map(p => p.name), o.slot?.date])
    ).toEqual([
      // Already lapsed: due within two weeks; three people in sessions of two.
      ['BOZP-Z|now|1', '2026-10-30', 2, ['Adámek Petr', 'Bílá Jana'], '2026-10-19'],
      ['BOZP-Z|now|2', '2026-10-30', 1, ['Dvořák Jan'], '2026-10-20'],
      // Due the day before the first of them lapses.
      ['BOZP-Z|2026-12|1', '2026-12-02', 2, ['Eliáš Karel', 'Cibulka Ota'], '2026-10-21'],
    ])
    // One group per course, holding its offers in order.
    expect(groupOffers(offers).map(g => [g.course.code, g.offers.map(o => o.id)])).toEqual([
      ['BOZP-Z', ['BOZP-Z|now|1', 'BOZP-Z|now|2', 'BOZP-Z|2026-12|1']],
    ])
    expect(groupOffers([])).toEqual([])
    expect(offers[0]).toMatchObject({
      slot: {
        startTime: '08:00',
        endTime: '11:00',
        startsAt: '2026-10-19T06:00:00.000Z',
        endsAt: '2026-10-19T09:00:00.000Z',
      },
      room: { id: 'aula', name: 'Aula A', kind: 'CLASSROOM' },
      // The course's group of two, in a room of thirty.
      capacity: 2,
      late: false,
      problem: null,
    })
    expect(offers[0]?.people[0]).toEqual({
      externalId: expect.stringMatching(/^E\d{4}$/) as string,
      name: 'Adámek Petr',
      department: 'Laboratoře',
      lapses: null,
    })
  })

  it('ignores what is planned, what clashes with another booking, and unknown courses', () => {
    const planned: PlanItem = {
      ...unplaced('Adámek Petr'),
      proposal: null,
      remediation: 'PLANNED',
    }
    const proposed: PlanItem = {
      ...unplaced('Bílá Jana'),
      proposal: {
        kind: 'SESSION',
        rank: 1,
        window: null,
        alternatives: [],
        session: {
          externalId: 'T016',
          courseCode: 'BOZP-Z',
          courseName: 'BOZP',
          room: { id: 'aula', name: 'Aula A', kind: 'CLASSROOM' },
          roomCapacity: 40,
          startsAt: '2026-11-04T07:00:00.000Z',
          endsAt: '2026-11-04T10:00:00.000Z',
          capacity: 30,
          unnamedBookings: 0,
          assigned: [],
          pricePerPerson: null,
          status: 'PLANNED',
        },
      },
    }
    const offers = planSessions(
      input({
        items: [
          planned,
          proposed,
          unplaced('Cibulka Ota', { reason: 'CONFLICT' }),
          unplaced('Dvořák Jan', { code: 'NOPE' }),
        ],
      })
    )
    expect(offers).toEqual([])
  })

  it('fills the largest suitable room when the course has no group size', () => {
    const noGroup = course({ groupSize: null, sessionMinutes: null, usualStart: null })
    const items = [unplaced('A'), unplaced('B'), unplaced('C')]
    const offers = planSessions(input({ courses: [noGroup], items }))
    expect(offers.map(o => o.size)).toEqual([3])
    // The default start and length; the offer carries what the course's sessions need.
    expect(offers[0]?.slot).toMatchObject({ startTime: '09:00', endTime: '12:00' })
    expect(DEFAULT_SESSION_MINUTES).toBe(180)
    expect(offers[0]?.course).toEqual({
      id: 'course_bozp',
      code: 'BOZP-Z',
      name: 'BOZP – základní školení',
      sessionMinutes: null,
      groupSize: null,
      onlineAllowed: false,
      capabilities: [],
    })
    // Rooms of two: two sessions, not one that fits nowhere.
    const small = [room({ id: 'a', capacity: 2 }), room({ id: 'b', capacity: 1 })]
    expect(
      planSessions(input({ courses: [noGroup], items, rooms: small })).map(o => o.size)
    ).toEqual([2, 1])
    // Online takes everyone at once, and opens a seat for each.
    const online = room({ id: 'o', kind: 'ONLINE', capacity: null })
    expect(
      planSessions(
        input({ courses: [{ ...noGroup, onlineAllowed: true }], items, rooms: [online] })
      ).map(o => [o.size, o.capacity])
    ).toEqual([[3, 3]])
  })
})

describe('planSessions: rooms', () => {
  it('prefers rooms the course was held in, then the smallest that fits', () => {
    const rooms = [
      room({ id: 'big', capacity: 80 }),
      room({ id: 'small', capacity: 12 }),
      room({ id: 'tiny', capacity: 1 }),
      room({ id: 'usual', capacity: 40 }),
    ]
    const items = [unplaced('A'), unplaced('B')]
    expect(
      planSessions(input({ rooms, items, courses: [course({ groupSize: 20 })] }))[0]
    ).toMatchObject({
      room: { id: 'small' },
      // A group of twenty, as far as a room of twelve allows.
      capacity: 12,
      alternatives: [{ id: 'usual' }, { id: 'big' }],
    })
    expect(
      planSessions(input({ rooms, items, courses: [course({ heldIn: ['usual'] })] }))[0]?.room?.id
    ).toBe('usual')
  })

  it('needs every capability on site, and takes an online room only when allowed', () => {
    const rooms = [
      room({ id: 'online', kind: 'ONLINE', capacity: null }),
      room({ id: 'class', capabilities: ['PROJECTOR'] }),
      room({ id: 'lab', kind: 'LAB', capabilities: ['PROJECTOR', 'LAB_EQUIPMENT'] }),
    ]
    const items = [unplaced('A')]
    const lab = course({ capabilities: ['LAB_EQUIPMENT'] })
    expect(planSessions(input({ rooms, items, courses: [lab] }))[0]?.room?.id).toBe('lab')
    // Online is unlimited: it comes after every room with a seat count.
    expect(
      planSessions(input({ rooms, items, courses: [course({ onlineAllowed: true })] }))[0]
    ).toMatchObject({ room: { id: 'class' }, alternatives: [{ id: 'lab' }, { id: 'online' }] })
  })

  it('moves to another room, or another day, when a room is taken', () => {
    const rooms = [room({ id: 'a', capacity: 10 }), room({ id: 'b', capacity: 20 })]
    const items = [unplaced('A')]
    const takenA = planSessions(input({ rooms, items, sessions: [busyAllDay('a', '2026-10-19')] }))
    expect(takenA[0]).toMatchObject({ slot: { date: '2026-10-19' }, room: { id: 'b' } })
    const takenBoth = planSessions(
      input({
        rooms,
        items,
        sessions: [busyAllDay('a', '2026-10-19'), busyAllDay('b', '2026-10-19')],
      })
    )
    expect(takenBoth[0]).toMatchObject({ slot: { date: '2026-10-20' }, room: { id: 'a' } })
  })

  it('does not double-book a room with its own offers', () => {
    const offers = planSessions(
      input({
        courses: [course(), course({ code: 'GDPR', name: 'GDPR' })],
        items: [unplaced('A'), unplaced('B', { code: 'GDPR' })],
      })
    )
    expect(offers.map(o => o.slot?.date)).toEqual(['2026-10-19', '2026-10-20'])
  })

  it('skips Czech holidays, and never counts an online room as taken', () => {
    // Busy 19-27 October; the 28th is a holiday, so the 29th.
    const sessions = [19, 20, 21, 22, 23, 26, 27].map(d =>
      busyAllDay('aula', `2026-10-${String(d)}`)
    )
    expect(planSessions(input({ items: [unplaced('A')], sessions }))[0]?.slot?.date).toBe(
      '2026-10-29'
    )
    const online = room({ id: 'o', kind: 'ONLINE', capacity: null })
    expect(
      planSessions(
        input({
          courses: [course({ onlineAllowed: true })],
          rooms: [online],
          items: [unplaced('A')],
          sessions: [busyAllDay('o', '2026-10-19')],
        })
      )[0]
    ).toMatchObject({ slot: { date: '2026-10-19' }, room: { id: 'o' }, capacity: 2 })
  })

  it('offers a late slot when the room is taken until after the due date', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10)
      return busyAllDay('aula', date)
    })
    const [offer] = planSessions(input({ items: [unplaced('A')], sessions }))
    expect(offer).toMatchObject({
      deadline: '2026-10-30',
      slot: { date: '2026-11-02' },
      late: true,
    })
  })
})

describe('planSessions: when it cannot', () => {
  it('names what the best-equipped room still lacks', () => {
    const [offer] = planSessions(
      input({
        courses: [course({ capabilities: ['VEHICLE', 'PROJECTOR', 'COMPUTERS'] })],
        // Each room has some; none has all.
        rooms: [
          room({ id: 'a', capabilities: ['PROJECTOR'] }),
          room({ id: 'b', capabilities: ['PROJECTOR', 'COMPUTERS'] }),
          room({ id: 'c', capabilities: ['VEHICLE'] }),
        ],
        items: [unplaced('A')],
      })
    )
    expect(offer).toMatchObject({
      slot: null,
      room: null,
      problem: { kind: 'NO_ROOM_WITH', missing: ['VEHICLE'] },
    })
  })

  it('says when every equipped room is too small, whatever the others seat', () => {
    const [offer] = planSessions(
      input({
        courses: [course({ capabilities: ['PROJECTOR'] })],
        rooms: [
          room({ id: 'a', capacity: 1, capabilities: ['PROJECTOR'] }),
          room({ id: 'big', capacity: 80 }),
        ],
        items: [unplaced('A'), unplaced('B')],
      })
    )
    expect(offer?.problem).toEqual({ kind: 'NO_ROOM_LARGE_ENOUGH', largest: 1 })
  })

  it('says when there is nowhere at all: only an online room, and the course is on site', () => {
    const [offer] = planSessions(
      input({
        rooms: [room({ id: 'o', kind: 'ONLINE', capacity: null })],
        items: [unplaced('A')],
      })
    )
    expect(offer?.problem).toEqual({ kind: 'NO_ONLINE_OR_ROOM' })
    expect(planSessions(input({ rooms: [], items: [unplaced('A')] }))[0]?.problem).toEqual({
      kind: 'NO_ONLINE_OR_ROOM',
    })
  })

  it('says when no slot is free in the horizon, and when a session would run past midnight', () => {
    const always: PlannerSession = {
      roomId: 'aula',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2028-01-01T00:00:00.000Z',
    }
    expect(planSessions(input({ items: [unplaced('A')], sessions: [always] }))[0]?.problem).toEqual(
      { kind: 'NO_FREE_SLOT' }
    )
    expect(
      planSessions(
        input({
          courses: [course({ usualStart: '22:00', sessionMinutes: 180 })],
          items: [unplaced('A')],
        })
      )[0]?.problem
    ).toEqual({ kind: 'RUNS_PAST_MIDNIGHT' })
  })
})
