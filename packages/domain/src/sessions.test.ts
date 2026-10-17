import { describe, expect, it } from 'vitest'

import type { RoomFacts, SessionNeeds } from './rooms'
import { NEARLY_FULL_RATIO, occupancy, sessionIssues } from './sessions'

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
  const needs: SessionNeeds = { groupSize: 20, onlineAllowed: false, capabilities: ['PROJECTOR'] }
  const fine = {
    startTime: '09:00',
    endTime: '12:00',
    capacity: 20,
    booked: 5,
    planned: true,
    room,
    needs,
  }

  it('finds nothing wrong with a session that fits', () => {
    expect(sessionIssues(fine)).toEqual([])
  })

  it('finds an end before the start, seats below the bookings and a room that cannot hold it', () => {
    expect(sessionIssues({ ...fine, endTime: '09:00' })).toEqual([{ kind: 'END_BEFORE_START' }])
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
    expect(sessionIssues({ ...fine, startTime: '', endTime: '' })).toEqual([])
  })
})
