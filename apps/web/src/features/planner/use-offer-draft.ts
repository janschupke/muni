'use client'

import type { RoomOption } from '@muni/db/repositories'
import type { SessionOffer } from '@muni/domain/planner'
import type { SessionNeeds } from '@muni/domain/rooms'
import { sessionIssues } from '@muni/domain/sessions'
import { isWorkingDay, todayIn, zonedTimeToUtc } from '@muni/utils/dates'
import { formatDate, formatTimeRange, PLACEHOLDER } from '@muni/utils/format'
import { parseAmount, parseCount } from '@muni/utils/money'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useRoomBusy, useRoomMismatchError } from '@/components/form/session-checks'

/**
 * A planner offer as the user edits it before it becomes a session: the day, times, room,
 * seats, price and who is booked, with what is wrong (errors, which stop the check) and what
 * is worth knowing (warnings: a day off, a date after the due date), checked as the user
 * types by the same rules as the session form. `onEdit` runs on every change: the review
 * starts over.
 */
export function useOfferDraft(
  offer: SessionOffer,
  rooms: readonly RoomOption[],
  onEdit: () => void
) {
  const t = useTranslations('planner.review')
  const te = useTranslations('forms.errors')
  const needs: SessionNeeds = {
    groupSize: offer.course.groupSize,
    onlineAllowed: offer.course.onlineAllowed,
    capabilities: offer.course.capabilities,
  }
  const [date, setDate] = useState(offer.slot?.date ?? '')
  const [startTime, setStartTime] = useState(offer.slot?.startTime ?? '')
  const [endTime, setEndTime] = useState(offer.slot?.endTime ?? '')
  const [roomId, setRoomId] = useState(offer.room?.id ?? '')
  const [capacity, setCapacity] = useState(String(offer.capacity ?? offer.size))
  const [price, setPrice] = useState('')
  const [people, setPeople] = useState<ReadonlySet<string>>(
    () => new Set(offer.people.map(p => p.externalId))
  )

  const room = rooms.find(r => r.id === roomId)
  const seats = parseCount(capacity)
  const pricePerPerson = parseAmount(price)
  const issues = sessionIssues({
    startTime,
    endTime,
    capacity: seats,
    booked: people.size,
    planned: true,
    room: room ?? null,
    needs,
  })
  const busy = useRoomBusy(
    room !== undefined && room.kind !== 'ONLINE' && date !== '' && endTime > startTime
      ? { roomId, date, startTime, endTime }
      : null,
    null
  )
  const mismatchError = useRoomMismatchError()
  const mismatch = issues.find(i => i.kind === 'ROOM')
  const unfit =
    mismatch?.kind === 'ROOM' ? mismatchError(mismatch.mismatch, room?.name ?? '') : null

  const errors = {
    date: date !== '' && date < todayIn() ? te('in_past') : undefined,
    endTime: issues.some(i => i.kind === 'END_BEFORE_START') ? te('before_start') : undefined,
    roomId: unfit ? te(unfit.key, unfit.values) : busy ? te('room_busy') : undefined,
    // Too few seats in the room: fewer seats settle it as well as another room.
    capacity:
      seats === null || seats < 1
        ? te('not_a_number')
        : issues.some(i => i.kind === 'BELOW_BOOKED')
          ? t('capacityLow', { count: people.size })
          : unfit && mismatch?.kind === 'ROOM' && mismatch.mismatch.kind === 'TOO_SMALL'
            ? te(unfit.key, unfit.values)
            : undefined,
    price: pricePerPerson === undefined ? te('not_a_number') : undefined,
  }
  const valid = date !== '' && room !== undefined && Object.values(errors).every(e => !e)

  const warnings = [
    ...(date !== '' && !isWorkingDay(date) ? [t('notWorking', { date: formatDate(date) })] : []),
    ...(date > offer.deadline ? [t('late', { deadline: formatDate(offer.deadline) })] : []),
  ]

  const changing =
    <T>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      onEdit()
    }

  return {
    needs,
    values: { date, startTime, endTime, roomId, capacity, price, people },
    set: {
      date: changing(setDate),
      startTime: changing(setStartTime),
      endTime: changing(setEndTime),
      roomId: changing(setRoomId),
      capacity: changing(setCapacity),
      price: changing(setPrice),
      person: changing(({ externalId, on }: { externalId: string; on: boolean }) => {
        setPeople(current => {
          const next = new Set(current)
          if (on) next.add(externalId)
          else next.delete(externalId)
          return next
        })
      }),
    },
    room,
    seats,
    pricePerPerson,
    errors,
    valid,
    warnings,
    chosen: offer.people.filter(p => people.has(p.externalId)),
    when:
      date && startTime && endTime
        ? formatTimeRange(
            zonedTimeToUtc(date, startTime).toISOString(),
            zonedTimeToUtc(date, endTime).toISOString()
          )
        : PLACEHOLDER,
    /** What the server is asked: to check (`dryRun`) or to create and book. */
    request: (dryRun: boolean) => ({
      session: {
        courseId: offer.course.id,
        date,
        startTime,
        endTime,
        roomId,
        capacity: seats ?? 0,
        pricePerPerson: pricePerPerson ?? null,
        status: 'PLANNED' as const,
      },
      people: [...people],
      dryRun,
    }),
  }
}

export type OfferDraft = ReturnType<typeof useOfferDraft>
