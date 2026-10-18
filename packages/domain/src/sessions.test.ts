import { describe, expect, it } from 'vitest'

import type { RoomFacts, SessionNeeds } from './rooms'
import {
  NEARLY_FULL_RATIO,
  occupancy,
  openingOf,
  scheduleBlock,
  seatsLeft,
  sessionEnd,
  sessionEndTime,
  sessionIssues,
  sessionPhase,
  startsLater,
} from './sessions'

describe('occupancy', () => {
  it.each([
    [0, 30, 'OPEN'],
    [23, 30, 'OPEN'],
    [24, 30, 'NEARLY_FULL'],
    [28, 30, 'NEARLY_FULL'],
    [30, 30, 'FULL'],
    [31, 30, 'OVERBOOKED'],
    [0, 0, 'OPEN'],
    [1, 0, 'OVERBOOKED'],
  ])('%i booked of %i is %s', (booked, capacity, expected) => {
    expect(occupancy(booked, capacity)).toBe(expected)
  })

  it('turns yellow at the documented share', () => {
    expect(occupancy(NEARLY_FULL_RATIO * 100, 100)).toBe('NEARLY_FULL')
    expect(occupancy(NEARLY_FULL_RATIO * 100 - 1, 100)).toBe('OPEN')
  })
})

describe('sessionIssues', () => {
  const room: RoomFacts = {
    id: 'r1',
    name: 'Aula A',
    kind: 'CLASSROOM',
    capacity: 20,
    capabilities: ['PROJECTOR'],
  }
  const needs: SessionNeeds = { seats: 20, onlineAllowed: false, capabilities: ['PROJECTOR'] }
  const fine = {
    minutes: 180,
    offered: true,
    capacity: 20,
    booked: 5,
    planned: true,
    room,
    needs,
  }

  it('finds nothing wrong with a session that fits', () => {
    expect(sessionIssues(fine)).toEqual([])
  })

  it('finds a course with no length, a provider that does not offer it, seats below the bookings and a room that cannot hold it', () => {
    expect(sessionIssues({ ...fine, minutes: null })).toEqual([{ kind: 'NO_LENGTH' }])
    expect(sessionIssues({ ...fine, offered: false })).toEqual([{ kind: 'NOT_OFFERED' }])
    expect(sessionIssues({ ...fine, booked: 21 })).toEqual([{ kind: 'BELOW_BOOKED', booked: 21 }])
    expect(sessionIssues({ ...fine, capacity: 25 })).toEqual([
      { kind: 'ROOM', mismatch: { kind: 'TOO_SMALL', needed: 25, capacity: 20 } },
    ])
    expect(sessionIssues({ ...fine, needs: { ...needs, capabilities: ['COMPUTERS'] } })).toEqual([
      { kind: 'ROOM', mismatch: { kind: 'MISSING_CAPABILITIES', missing: ['COMPUTERS'] } },
    ])
  })

  it('leaves the room of a cancelled session alone, and what it does not know yet', () => {
    expect(sessionIssues({ ...fine, planned: false, capacity: 25 })).toEqual([])
    expect(sessionIssues({ ...fine, room: null, needs: null, capacity: null })).toEqual([])
    expect(sessionIssues({ ...fine, minutes: undefined, offered: undefined })).toEqual([])
  })
})

describe('scheduleBlock', () => {
  it('needs a length and a provider, and a room that suits the course; seats are no block', () => {
    const course = { sessionMinutes: 180, offerings: 2 }
    expect(scheduleBlock(course)).toBeNull()
    expect(scheduleBlock({ ...course, sessionMinutes: null })).toBe('NO_LENGTH')
    expect(scheduleBlock({ ...course, offerings: 0 })).toBe('NO_PROVIDER')
    expect(scheduleBlock(course, { mismatch: { kind: 'ONLINE_NOT_ALLOWED' } })).toBe(
      'ROOM_UNSUITABLE'
    )
    expect(
      scheduleBlock(course, { mismatch: { kind: 'TOO_SMALL', needed: 30, capacity: 20 } })
    ).toBeNull()
    expect(scheduleBlock(course, { mismatch: null })).toBeNull()
  })
})

describe('a session’s end', () => {
  it('is its course’s length after its start', () => {
    expect(sessionEnd(new Date('2026-11-02T08:00:00.000Z'), 180).toISOString()).toBe(
      '2026-11-02T11:00:00.000Z'
    )
    expect(sessionEndTime('09:00', 180)).toEqual({ time: '12:00', nextDay: false })
    expect(sessionEndTime('09:30', 45)).toEqual({ time: '10:15', nextDay: false })
    expect(sessionEndTime('22:00', 180)).toEqual({ time: '01:00', nextDay: true })
  })
})

describe('sessionPhase', () => {
  const at = (status: 'PLANNED' | 'CANCELLED') => ({
    status,
    startsAt: '2026-11-02T08:00:00.000Z',
    endsAt: '2026-11-02T12:00:00.000Z',
  })
  it('is ahead until it starts, running until it ends, then ended; cancelled whenever', () => {
    expect(sessionPhase(at('PLANNED'), new Date('2026-11-02T07:59:59.999Z'))).toBe('AHEAD')
    expect(sessionPhase(at('PLANNED'), new Date('2026-11-02T08:00:00.000Z'))).toBe('RUNNING')
    expect(sessionPhase(at('PLANNED'), new Date('2026-11-02T12:00:00.000Z'))).toBe('RUNNING')
    expect(sessionPhase(at('PLANNED'), new Date('2026-11-02T12:00:00.001Z'))).toBe('ENDED')
    expect(sessionPhase(at('CANCELLED'), new Date('2026-11-01T00:00:00.000Z'))).toBe('CANCELLED')
    expect(startsLater(at('CANCELLED'), new Date('2026-11-01T00:00:00.000Z'))).toBe(true)
    expect(startsLater(at('CANCELLED'), new Date('2026-11-02T08:00:00.000Z'))).toBe(false)
  })
})

describe('openings', () => {
  it('counts every booking against the seats', () => {
    expect(seatsLeft({ capacity: 10, unnamedBookings: 3, named: 2 })).toBe(5)
    expect(seatsLeft({ capacity: 2, unnamedBookings: 3, named: 0 })).toBe(-1)
  })
  it('is open with a free seat anywhere, full when every session is, none without one', () => {
    expect(openingOf([])).toBe('NONE')
    expect(openingOf([0, -1])).toBe('FULL')
    expect(openingOf([0, 2])).toBe('OPEN')
  })
})
