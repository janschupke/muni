import { describe, expect, it } from 'vitest'

import { type RoomFacts, roomFit, roomKindOfName, roomMismatch, type SessionNeeds } from './rooms'

const lab: RoomFacts = {
  id: 'r1',
  name: 'Laboratoř 3',
  kind: 'LAB',
  capacity: 20,
  capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
}
const online: RoomFacts = {
  id: 'r2',
  name: 'Online',
  kind: 'ONLINE',
  capacity: null,
  capabilities: [],
}
const needs: SessionNeeds = { groupSize: 20, onlineAllowed: false, capabilities: ['LAB_EQUIPMENT'] }

describe('roomMismatch', () => {
  it('accepts a room with every capability and enough seats', () => {
    expect(roomMismatch(lab, needs, 20)).toBeNull()
    expect(roomMismatch({ ...lab, capacity: null }, needs, 500)).toBeNull()
  })

  it('names what is missing, then whether it is too small', () => {
    expect(
      roomMismatch(lab, { ...needs, capabilities: ['COMPUTERS', 'LAB_EQUIPMENT'] }, 5)
    ).toEqual({ kind: 'MISSING_CAPABILITIES', missing: ['COMPUTERS'] })
    expect(roomMismatch(lab, needs, 21)).toEqual({ kind: 'TOO_SMALL', needed: 21, capacity: 20 })
    // A course with no group size is split by the room: seats are no limit.
    expect(roomMismatch(lab, needs, null)).toBeNull()
  })

  it('takes an online room only for courses that allow it, whatever they need on site', () => {
    expect(roomMismatch(online, needs, 20)).toEqual({ kind: 'ONLINE_NOT_ALLOWED' })
    expect(roomMismatch(online, { ...needs, onlineAllowed: true }, 300)).toBeNull()
  })
})

describe('roomFit', () => {
  it('sets each need beside what the room provides, failing or not', () => {
    expect(roomFit(lab, { ...needs, capabilities: ['COMPUTERS', 'LAB_EQUIPMENT'] }, 25)).toEqual({
      online: false,
      seats: { needed: 25, provided: 20, ok: false },
      equipment: { needed: ['COMPUTERS', 'LAB_EQUIPMENT'], missing: ['COMPUTERS'], ok: false },
      mismatch: { kind: 'MISSING_CAPABILITIES', missing: ['COMPUTERS'] },
    })
    expect(roomFit(lab, { ...needs, capabilities: [] }, null)).toEqual({
      online: false,
      seats: { needed: null, provided: 20, ok: true },
      equipment: { needed: [], missing: [], ok: true },
      mismatch: null,
    })
  })

  it('judges an online room only on whether the course may be held online', () => {
    expect(roomFit(online, needs, 20)).toEqual({
      online: true,
      allowed: false,
      mismatch: { kind: 'ONLINE_NOT_ALLOWED' },
    })
    expect(roomFit(online, { ...needs, onlineAllowed: true }, 300)).toEqual({
      online: true,
      allowed: true,
      mismatch: null,
    })
  })
})

describe('roomKindOfName', () => {
  it('reads the kind from a word in the name, else a classroom', () => {
    expect(roomKindOfName('Laboratoř 3')).toBe('LAB')
    expect(roomKindOfName('Online')).toBe('ONLINE')
    expect(roomKindOfName('E-learning')).toBe('ONLINE')
    expect(roomKindOfName('Učebna 2')).toBe('CLASSROOM')
    expect(roomKindOfName('Venkovní cvičiště')).toBe('OUTDOOR')
    expect(roomKindOfName('Seminární místnost')).toBe('CLASSROOM')
    // Not fooled by what every object has.
    expect(roomKindOfName('constructor')).toBe('CLASSROOM')
  })
})
