import { describe, expect, it } from 'vitest'

import { roomMismatch, type RoomFacts, type SessionNeeds } from './rooms'

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
    expect(roomMismatch(lab, needs, 21)).toEqual({ kind: 'TOO_SMALL', capacity: 20 })
  })

  it('takes an online room only for courses that allow it, whatever they need on site', () => {
    expect(roomMismatch(online, needs, 20)).toEqual({ kind: 'ONLINE_NOT_ALLOWED' })
    expect(roomMismatch(online, { ...needs, onlineAllowed: true }, 300)).toBeNull()
  })
})
