'use client'

import type { CourseOption, RoomOption } from '@muni/db/repositories'
import type { CourseOffering } from '@muni/domain/planner'
import type { SessionIssue } from '@muni/domain/sessions'
import { sessionEndTime } from '@muni/domain/sessions'
import { parseCount } from '@muni/utils/money'
import { compareCs } from '@muni/utils/text'
import { useState } from 'react'

import type { ClientError } from '@/components/form/form-context'

import { useSessionChecks } from './session-checks'
import type { SessionDefaults } from './session-form'

/** A course's providers as the form offers them: the default first, then by name. */
const byDefaultThenName = (a: CourseOffering, b: CourseOffering) =>
  Number(b.isDefault) - Number(a.isDefault) || compareCs(a.providerName, b.providerName)

/**
 * A session as its form edits it: what is typed, and what follows from it. What the session
 * keeps as stored (its end while the course and start stay, its price while the course and
 * provider stay) and what follows anew (the end from the course's length, the price from the
 * provider's offering), with the checks `useSessionChecks` makes as the user types.
 */
export function useSessionDraft({
  courses,
  rooms,
  defaults,
  isNew,
  named,
  self,
}: {
  courses: readonly CourseOption[]
  rooms: readonly RoomOption[]
  defaults: SessionDefaults
  isNew: boolean
  /** Named bookings: they hold seats too. */
  named: number
  self: string | null
}) {
  const [courseId, setCourseId] = useState(defaults.courseId)
  const [providerId, setProviderId] = useState(defaults.providerId)
  const [roomId, setRoomId] = useState(defaults.roomId)
  const [capacity, setCapacity] = useState(defaults.capacity?.toString() ?? '')
  const [unnamed, setUnnamed] = useState(String(defaults.unnamedBookings))
  const [date, setDate] = useState(defaults.date)
  const [startTime, setStartTime] = useState(defaults.startTime)

  const course = courses.find(c => c.id === courseId)
  const room = rooms.find(r => r.id === roomId)
  const seats = parseCount(capacity)
  const unnamedSeats = isNew ? 0 : (parseCount(unnamed) ?? 0)
  const booked = unnamedSeats + named
  const planned = defaults.status === 'PLANNED'

  // What the session keeps as stored, and what follows anew from the course and provider.
  const sameCourse = !isNew && courseId === defaults.courseId
  const sameOffer = sameCourse && providerId === defaults.providerId
  const sameTime = sameCourse && date === defaults.date && startTime === defaults.startTime
  const offerings = (course?.offerings ?? []).toSorted(byDefaultThenName)
  const offering = offerings.find(o => o.providerId === providerId)
  const minutes = course?.needs.sessionMinutes
  const end =
    sameTime || !startTime
      ? { time: defaults.endTime, nextDay: false }
      : minutes == null
        ? null
        : sessionEndTime(startTime, minutes)
  const price = sameOffer ? defaults.pricePerPerson : (offering?.price ?? null)

  const { issues, busy, roomError } = useSessionChecks({
    rules: {
      minutes: course && !sameTime ? (minutes ?? null) : undefined,
      offered: course && providerId && !sameOffer ? offering !== undefined : undefined,
      capacity: seats,
      booked,
      needs: course?.needs ?? null,
    },
    room,
    roomId,
    date,
    startTime,
    end,
    planned,
    self: self ?? null,
  })

  const clientErrors: Partial<Record<string, ClientError>> = {}
  for (const issue of issues) Object.assign(clientErrors, errorOf(issue))
  if (busy) clientErrors['roomId'] ??= { key: 'room_busy' }

  /** Each field that can settle the issue, with what it says. */
  function errorOf(issue: SessionIssue): Partial<Record<string, ClientError>> {
    switch (issue.kind) {
      case 'NO_LENGTH':
        return { courseId: { key: 'no_length' } }
      case 'NOT_OFFERED':
        // Another provider, or another course that this provider offers.
        return { providerId: { key: 'not_offered' }, courseId: { key: 'not_offered' } }
      case 'BELOW_BOOKED': {
        const error: ClientError = { key: 'below_booked', values: { booked: issue.booked } }
        // Fewer unnamed seats settle it only where there are some.
        return unnamedSeats > 0 ? { capacity: error, unnamedBookings: error } : { capacity: error }
      }
      case 'ROOM': {
        const error = roomError(issue.mismatch)
        // Too few seats: a bigger room or fewer seats. Anything else the room lacks: another
        // room, or a course that does not need it.
        return issue.mismatch.kind === 'TOO_SMALL'
          ? { roomId: error, capacity: error }
          : { roomId: error, courseId: error }
      }
    }
  }

  return {
    /** The checks' findings, on each field that can settle them. */
    clientErrors,
    courseId,
    setCourseId,
    providerId,
    setProviderId,
    roomId,
    setRoomId,
    capacity,
    setCapacity,
    unnamed,
    setUnnamed,
    date,
    setDate,
    startTime,
    setStartTime,
    course,
    room,
    seats,
    unnamedSeats,
    booked,
    planned,
    sameCourse,
    sameOffer,
    sameTime,
    offerings,
    minutes,
    end,
    price,
    issues,
    busy,
    roomError,
  }
}
