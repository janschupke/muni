import { type CourseOffering, DEFAULT_START, proposedOffering } from '@muni/domain/planner'
import { sessionEndTime } from '@muni/domain/sessions'
import { addDays, todayIn } from '@muni/utils/dates'

import type { SessionDefaults } from '@/components/form/session-form'

/**
 * What a new session form starts with: tomorrow at the planner's default start; the course's
 * seats and its proposed provider (the default one if it offers the course, else the cheapest),
 * unless the page that opened the form named a room or provider; the end follows the course's
 * length. With no course chosen yet, the course is for the user to pick.
 */
export function newSessionDefaults(
  course: {
    id: string
    needs: { sessionMinutes: number | null; seats: number | null }
    offerings: readonly CourseOffering[]
  } | null,
  prefill: { room?: string | undefined; provider?: string | undefined } = {}
): SessionDefaults {
  const date = addDays(todayIn(), 1)
  const minutes = course?.needs.sessionMinutes ?? null
  return {
    courseId: course?.id ?? '',
    providerId:
      prefill.provider ?? (course ? (proposedOffering(course.offerings)?.providerId ?? '') : ''),
    date,
    startTime: DEFAULT_START,
    endTime: minutes === null ? '' : sessionEndTime(DEFAULT_START, minutes).time,
    roomId: prefill.room ?? '',
    capacity: course?.needs.seats ?? null,
    unnamedBookings: 0,
    pricePerPerson: null,
    status: 'PLANNED',
  }
}
