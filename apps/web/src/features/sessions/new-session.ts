import { DEFAULT_SESSION_MINUTES, DEFAULT_START } from '@muni/domain/planner'
import { addDays, todayIn, toZonedParts, zonedTimeToUtc } from '@muni/utils/dates'

/**
 * What a new session form starts with: tomorrow at the planner's default start, for the
 * course's usual length and group (or the defaults, when the course is chosen in the form).
 * A course's length is at most 12 hours, so the session ends the same day.
 */
export function newSessionDefaults(
  course: { sessionMinutes: number | null; groupSize: number | null } | null
) {
  const date = addDays(todayIn(), 1)
  const ends = new Date(
    zonedTimeToUtc(date, DEFAULT_START).getTime() +
      (course?.sessionMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000
  )
  return {
    date,
    startTime: DEFAULT_START,
    endTime: toZonedParts(ends).time,
    roomId: '',
    capacity: course?.groupSize ?? null,
    unnamedBookings: 0,
    assignedCount: 0,
    pricePerPerson: null,
    status: 'PLANNED',
  }
}
