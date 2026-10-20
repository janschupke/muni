import { type AdvisorSession, type OverbookedSession, type SeatMove, seatsFree } from './types'

/** A session still to start with the seats taken on it, as the plan fills it. */
export interface Slot {
  session: AdvisorSession
  taken: number
}

/**
 * The sessions booked over their capacity, each with a suggestion: its anonymous seats moved
 * to the earliest other sessions of the course with room (named bookings never move), every
 * session they could go to instead, and the capacity that would fit everyone when the room has
 * the seats. The moved seats are taken on `slots`, so the plan does not offer them again.
 */
export function resolveOverbooking(slots: Slot[]): OverbookedSession[] {
  const overbooked: OverbookedSession[] = []
  for (const source of slots) {
    const before = source.taken
    const excess = before - source.session.capacity
    if (excess <= 0) continue
    let movable = Math.min(excess, source.session.unnamedBookings)
    const moves: SeatMove[] = []
    for (const target of slots) {
      if (movable === 0) break
      if (target === source || target.session.courseCode !== source.session.courseCode) continue
      const room = target.session.capacity - target.taken
      if (room <= 0) continue
      const count = Math.min(room, movable)
      moves.push({ to: target.session, count })
      target.taken += count
      source.taken -= count
      movable -= count
    }
    const moved = moves.reduce((n, m) => n + m.count, 0)
    const { roomCapacity } = source.session
    overbooked.push({
      session: source.session,
      booked: before,
      excess,
      moves,
      remaining: excess - moved,
      targets: slots.flatMap(({ session }) => {
        const free = seatsFree(session)
        return session !== source.session &&
          session.courseCode === source.session.courseCode &&
          free > 0
          ? [{ session, free }]
          : []
      }),
      raiseTo: roomCapacity === null || roomCapacity >= before ? before : null,
    })
  }
  return overbooked
}

/**
 * What typed seat moves off an overbooked session come to: the seats moved, the targets given
 * more than they have free, and whether the total exceeds the seats booked without a name (the
 * only ones that move). `counts` are per target session ID; null is a count that is not a whole
 * number, an absent one moves nothing.
 */
export function checkMoves(
  o: OverbookedSession,
  counts: ReadonlyMap<string, number | null>
): {
  moves: { target: OverbookedSession['targets'][number]; count: number | null }[]
  total: number
  /** Targets given more than they have free. */
  overTarget: string[]
  tooMany: boolean
  /** Every count is a whole number, something moves, and nothing is over. */
  ready: boolean
} {
  const moves = o.targets.map(target => ({
    target,
    count: counts.has(target.session.externalId)
      ? (counts.get(target.session.externalId) ?? null)
      : 0,
  }))
  const total = moves.reduce((sum, m) => sum + (m.count ?? 0), 0)
  const overTarget = moves.flatMap(m =>
    m.count !== null && m.count > m.target.free ? [m.target.session.externalId] : []
  )
  const tooMany = total > o.session.unnamedBookings
  const typed = moves.every(m => m.count !== null)
  return {
    moves,
    total,
    overTarget,
    tooMany,
    ready:
      o.session.unnamedBookings > 0 && typed && total > 0 && overTarget.length === 0 && !tooMany,
  }
}
