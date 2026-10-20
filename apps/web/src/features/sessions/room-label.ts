'use client'

import type { RoomOption } from '@muni/db/repositories'
import { roomMismatch, type SessionNeeds } from '@muni/domain/rooms'
import { useTranslations } from 'next-intl'

/**
 * A room in a list of rooms: its name and seats, and why it does not suit the course (for
 * `seats` people) when it does not.
 */
export function useRoomLabel(): (
  room: RoomOption,
  needs: SessionNeeds | null,
  seats: number | null
) => string {
  const t = useTranslations('forms.session')
  return (room, needs, seats) => {
    const base =
      room.capacity === null
        ? t('roomOnline', { name: room.name })
        : t('roomOption', { name: room.name, seats: room.capacity })
    const unfit = needs ? roomMismatch(room, needs, seats) : null
    return unfit ? `${base} · ${t(`unfit.${unfit.kind}`)}` : base
  }
}
