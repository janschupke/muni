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

/**
 * Where a session stands: still to start (it can be booked, or cancelled), under way, over, or
 * cancelled. The one rule every screen and the server use; a cancelled session is cancelled
 * whenever it was meant to run.
 */
export type SessionPhase = 'AHEAD' | 'RUNNING' | 'ENDED' | 'CANCELLED'

export function sessionPhase(
  session: { status: 'PLANNED' | 'CANCELLED'; startsAt: string | Date; endsAt: string | Date },
  now: Date
): SessionPhase {
  if (session.status === 'CANCELLED') return 'CANCELLED'
  if (new Date(session.startsAt) > now) return 'AHEAD'
  // Up to and including its last moment, as "upcoming" counts it.
  return new Date(session.endsAt) >= now ? 'RUNNING' : 'ENDED'
}

/** Whether a session is still to start, whatever its status (a cancelled one can come back). */
export const startsLater = (session: { startsAt: string | Date }, now: Date): boolean =>
  new Date(session.startsAt) > now

/** Seats a session has free: its capacity less every booking, named or not. */
export function seatsLeft(session: {
  capacity: number
  unnamedBookings: number
  named: number
}): number {
  return session.capacity - session.unnamedBookings - session.named
}

/**
 * Whether a course can be booked now: a planned session still to start has a free seat
 * (`OPEN`), every such session is full (`FULL`), or none is scheduled (`NONE`).
 */
export type SessionOpening = 'OPEN' | 'FULL' | 'NONE'

/** The opening the course's planned sessions still to start (and their free seats) give. */
export function openingOf(freeSeats: readonly number[]): SessionOpening {
  if (freeSeats.length === 0) return 'NONE'
  return freeSeats.some(n => n > 0) ? 'OPEN' : 'FULL'
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
