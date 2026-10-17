'use client'

import type { RoomOption } from '@muni/db/repositories'
import { roomMismatch, type SessionNeeds } from '@muni/domain/rooms'
import type { DatePickerLabels } from '@muni/ui/date-picker'
import type { TimePickerLabels } from '@muni/ui/time-picker'
import { useTranslations } from 'next-intl'

// What the date and time pickers and the room list say, shared by the forms and the
// planner's review, so a session reads the same wherever it is edited.

/** The date picker's words, for the field named `field`. */
export function useDateLabels(): (field: string) => DatePickerLabels {
  const t = useTranslations('forms.picker')
  return field => ({
    open: t('chooseDate', { field }),
    previousMonth: t('previousMonth'),
    nextMonth: t('nextMonth'),
    previousYear: t('previousYear'),
    nextYear: t('nextYear'),
    today: t('today'),
    clear: t('clear'),
    format: { day: t('format.day'), month: t('format.month'), year: t('format.year') },
  })
}

/** The time picker's words, for the field named `field`. */
export function useTimeLabels(): (field: string) => TimePickerLabels {
  const t = useTranslations('forms.picker')
  return field => ({ open: t('chooseTime', { field }), hours: t('hours'), minutes: t('minutes') })
}

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
