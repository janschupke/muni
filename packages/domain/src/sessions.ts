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

/** A course session's length bounds, in minutes: at most 12 hours. */
export const SESSION_MINUTES = { min: 15, max: 720 } as const

/**
 * When a session that starts at `start` ends: its course's length later. The one rule the
 * form (which shows the end), the planner and the server (which stores it) use.
 */
export function sessionEnd(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60_000)
}

/** The end as a wall-clock time (`HH:MM`) for a start time of day; `nextDay` past midnight. */
export function sessionEndTime(
  startTime: string,
  minutes: number
): { time: string; nextDay: boolean } {
  const [h = 0, m = 0] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutes
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    time: `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`,
    nextDay: total >= 24 * 60,
  }
}

/** Why a session of a course cannot be scheduled from where the button shows. */
export const SCHEDULE_BLOCKS = ['NO_LENGTH', 'NO_PROVIDER', 'ROOM_UNSUITABLE'] as const
export type ScheduleBlock = (typeof SCHEDULE_BLOCKS)[number]

/**
 * Whether a new session of the course can be scheduled (in the room, when one is given): the
 * course needs a length and a provider that offers it; a room must suit it (online allowed,
 * the equipment). Too few seats is no block: a session can open fewer than the course's.
 */
export function scheduleBlock(
  course: { sessionMinutes: number | null; offerings: number },
  room?: { mismatch: RoomMismatch | null } | null
): ScheduleBlock | null {
  if (course.sessionMinutes === null) return 'NO_LENGTH'
  if (course.offerings === 0) return 'NO_PROVIDER'
  if (room?.mismatch && room.mismatch.kind !== 'TOO_SMALL') return 'ROOM_UNSUITABLE'
  return null
}

/** Why a planned session cannot be saved as it is, as far as its own facts tell. */
export type SessionIssue =
  /** Its course has no length set: nothing can be scheduled until it has one. */
  | { kind: 'NO_LENGTH' }
  /** Its provider does not offer its course. */
  | { kind: 'NOT_OFFERED' }
  | { kind: 'BELOW_BOOKED'; booked: number }
  | { kind: 'ROOM'; mismatch: RoomMismatch }

/**
 * Everything wrong with a session that its course, provider, room, seats and bookings show,
 * without asking the database (a room taken at that time is the server's to tell). The form
 * runs it as the user types; the server runs it again before writing. A cancelled session
 * keeps its room whatever it holds; its seats still cannot drop below the bookings.
 */
export function sessionIssues(session: {
  /** The course's length; null = not set. (Unknown while no course is chosen: undefined.) */
  minutes: number | null | undefined
  /** Whether the provider offers the course; undefined while either is unchosen. */
  offered: boolean | undefined
  capacity: number | null
  /** Unnamed plus named bookings. */
  booked: number
  planned: boolean
  room: RoomFacts | null
  needs: SessionNeeds | null
}): SessionIssue[] {
  const issues: SessionIssue[] = []
  if (session.minutes === null) issues.push({ kind: 'NO_LENGTH' })
  if (session.offered === false) issues.push({ kind: 'NOT_OFFERED' })
  if (session.capacity !== null && session.booked > session.capacity)
    issues.push({ kind: 'BELOW_BOOKED', booked: session.booked })
  if (session.planned && session.room && session.needs) {
    const mismatch = roomMismatch(session.room, session.needs, session.capacity)
    if (mismatch) issues.push({ kind: 'ROOM', mismatch })
  }
  return issues
}
