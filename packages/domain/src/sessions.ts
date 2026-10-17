import { type RoomFacts, type RoomMismatch, roomMismatch, type SessionNeeds } from './rooms'

/** Booked share at which a session counts as nearly full (and is shown in yellow). */
export const NEARLY_FULL_RATIO = 0.8

export const OCCUPANCIES = ['OPEN', 'NEARLY_FULL', 'FULL', 'OVERBOOKED'] as const
export type Occupancy = (typeof OCCUPANCIES)[number]

/** How booked a session is. A session without seats (capacity 0) is only ever overbooked. */
export function occupancy(booked: number, capacity: number): Occupancy {
  if (booked > capacity) return 'OVERBOOKED'
  if (capacity === 0) return 'OPEN'
  if (booked === capacity) return 'FULL'
  if (booked / capacity >= NEARLY_FULL_RATIO) return 'NEARLY_FULL'
  return 'OPEN'
}

/** Why a planned session cannot be saved as it is, as far as its own facts tell. */
export type SessionIssue =
  | { kind: 'END_BEFORE_START' }
  | { kind: 'BELOW_BOOKED'; booked: number }
  | { kind: 'ROOM'; mismatch: RoomMismatch }

/**
 * Everything wrong with a session that its course, room, seats and bookings show, without
 * asking the database (a room taken at that time is the server's to tell). The form runs it
 * as the user types; the server runs it again before writing. A cancelled session keeps its
 * room whatever it holds; its seats still cannot drop below the bookings.
 */
export function sessionIssues(session: {
  startTime: string
  endTime: string
  capacity: number | null
  /** Unnamed plus named bookings. */
  booked: number
  planned: boolean
  room: RoomFacts | null
  needs: SessionNeeds | null
}): SessionIssue[] {
  const issues: SessionIssue[] = []
  if (session.startTime && session.endTime && session.endTime <= session.startTime)
    issues.push({ kind: 'END_BEFORE_START' })
  if (session.capacity !== null && session.booked > session.capacity)
    issues.push({ kind: 'BELOW_BOOKED', booked: session.booked })
  if (session.planned && session.room && session.needs) {
    const mismatch = roomMismatch(session.room, session.needs, session.capacity)
    if (mismatch) issues.push({ kind: 'ROOM', mismatch })
  }
  return issues
}
