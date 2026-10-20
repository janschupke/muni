'use client'

import type { RoomMismatch } from '@muni/domain/rooms'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { ClientError } from '@/components/form/form-shell'
import { checkSessionSlotAction } from '@/server/actions/sessions'

// What the session form and the planner's review both check as the user types: the same rule
// says the same thing on both screens.

export interface Slot {
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
export function useRoomBusy(slot: Slot | null, self: string | null): boolean {
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
export function useRoomMismatchError(): (mismatch: RoomMismatch, room: string) => ClientError {
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
