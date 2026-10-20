'use client'

import type { RoomOption } from '@muni/db/repositories'
import type { RoomMismatch } from '@muni/domain/rooms'
import { sessionIssues } from '@muni/domain/sessions'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { ClientError } from '@/components/form/form-context'
import { checkSessionSlotAction } from '@/server/actions/sessions'

// What the session form and the planner's review both check as the user types: the same rule
// says the same thing on both screens.

interface Slot {
  roomId: string
  date: string
  startTime: string
  endTime: string
}

/**
 * Whether another planned session holds the room then, asked of the server as the user picks
 * (after a pause). `slot` is null where there is nothing to ask: not planned, an online room,
 * no date, an end before the start. Each answer is kept with its question, so an answer to an
 * older one never shows for a newer one; an unanswered question says nothing (saving checks
 * again). `self` is the session being edited, which never clashes with itself.
 */
function useRoomBusy(slot: Slot | null, self: string | null): boolean {
  const key = slot && `${slot.roomId}|${slot.date}|${slot.startTime}|${slot.endTime}`
  const [answer, setAnswer] = useState<{ key: string; busy: boolean } | null>(null)
  const roomId = slot?.roomId
  const date = slot?.date
  const startTime = slot?.startTime
  const endTime = slot?.endTime
  useEffect(() => {
    if (key === null || !roomId || !date || !startTime || !endTime) return
    const timer = setTimeout(() => {
      checkSessionSlotAction({ roomId, date, startTime, endTime }, self).then(
        found => {
          setAnswer({ key, busy: found === 'ROOM_BUSY' })
        },
        () => {
          setAnswer({ key, busy: false })
        }
      )
    }, 400)
    return () => {
      clearTimeout(timer)
    }
  }, [key, roomId, date, startTime, endTime, self])
  return key !== null && answer?.key === key && answer.busy
}

/** Why the room does not suit the session, as a field error naming the room. */
function useRoomMismatchError(): (mismatch: RoomMismatch, room: string) => ClientError {
  const ts = useTranslations('status')
  return (mismatch, room) => {
    switch (mismatch.kind) {
      case 'TOO_SMALL':
        return {
          key: 'room_too_small_live',
          values: { room, capacity: mismatch.capacity, seats: mismatch.needed },
        }
      case 'ONLINE_NOT_ALLOWED':
        return { key: 'room_online_not_allowed' }
      case 'MISSING_CAPABILITIES':
        return {
          key: 'room_missing_live',
          values: { room, missing: mismatch.missing.map(c => ts(`capability.${c}`)).join(', ') },
        }
    }
  }
}

/**
 * The checks a session gets as the user types, the same on the session form and in the
 * planner's review: the session rules (`sessionIssues`), whether another planned session
 * holds the room then (asked of the server: only for a planned session in a physical room
 * with a day and an end on that day), and why the room does not suit it, as a field error.
 */
export function useSessionChecks({
  rules,
  room,
  roomId,
  date,
  startTime,
  end,
  planned,
  self,
}: {
  /** What `sessionIssues` judges besides the room and whether it is planned. */
  rules: Omit<Parameters<typeof sessionIssues>[0], 'room' | 'planned'>
  room: RoomOption | undefined
  roomId: string
  date: string
  startTime: string
  /** When the session ends; null without a length or a start. */
  end: { time: string; nextDay: boolean } | null
  planned: boolean
  /** The session being edited (never clashes with itself); null for a new one. */
  self: string | null
}) {
  const issues = sessionIssues({ ...rules, room: room ?? null, planned })
  const busy = useRoomBusy(
    planned && room !== undefined && room.kind !== 'ONLINE' && date !== '' && end && !end.nextDay
      ? { roomId, date, startTime, endTime: end.time }
      : null,
    self
  )
  const mismatchError = useRoomMismatchError()
  const roomError = (mismatch: RoomMismatch) => mismatchError(mismatch, room?.name ?? '')
  const roomIssue = issues.find(i => i.kind === 'ROOM')
  return {
    issues,
    busy,
    /** A room mismatch as the error a field shows, naming the room. */
    roomError,
    /** The room does not suit the session: how, and the error the room's field shows. */
    unfit:
      roomIssue?.kind === 'ROOM'
        ? { mismatch: roomIssue.mismatch, error: roomError(roomIssue.mismatch) }
        : null,
  }
}
