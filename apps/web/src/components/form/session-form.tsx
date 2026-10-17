'use client'

import type { CourseOption, RoomOption } from '@muni/db/repositories'
import { type SessionIssue, sessionIssues } from '@muni/domain/sessions'
import { FieldRow } from '@muni/ui/field'
import { currencySymbol, formatAmount } from '@muni/utils/format'
import { parseCount } from '@muni/utils/money'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { sessionCreateSpec, sessionEditSpec } from '@/lib/form-inputs'

import type { FormProps } from './form-props'
import {
  type ClientError,
  DateField,
  FormShell,
  type SaveConfirmation,
  SelectField,
  TextField,
  TimeField,
} from './form-shell'
import { useRoomBusy, useRoomMismatchError } from './session-checks'
import { useRoomLabel } from './session-fields'

export interface SessionDefaults {
  courseId: string
  date: string
  startTime: string
  endTime: string
  roomId: string
  /** null on a new session of a course with no group size: the seats are for the user to set. */
  capacity: number | null
  unnamedBookings: number
  pricePerPerson: number | null
  /**
   * As stored; the form never changes it (cancelling and reinstating are their own acts). A
   * cancelled session holds no room, so its room is not checked.
   */
  status: 'PLANNED' | 'CANCELLED'
}

/**
 * A session's form. The course, room and seats check each other as the user types, with the
 * same rules the server applies on save (`sessionIssues`): a room too small for the seats, one
 * lacking what the course needs, seats below the bookings. Whether the room is free then is
 * asked from the server as the user picks. A field never changes another: a conflict marks
 * every field that can settle it, and the form is not sent until one does.
 */
export function SessionForm({
  action,
  cancelHref,
  heading,
  courses,
  rooms,
  defaults,
  self = null,
  named = 0,
  isNew = false,
}: FormProps & {
  courses: readonly CourseOption[]
  rooms: readonly RoomOption[]
  defaults: SessionDefaults
  /** The session being edited (its ID): it never clashes with itself. */
  self?: string | null | undefined
  /** Named bookings, managed on the session's page; they hold seats too. (A new session has none,
   * and no unnamed seats to set.) */
  named?: number | undefined
}) {
  const t = useTranslations('forms.session')
  const tq = useTranslations('forms.session.confirm')
  const tsave = useTranslations('forms.save')
  const tp = useTranslations('forms.placeholders')

  const [courseId, setCourseId] = useState(defaults.courseId)
  const [roomId, setRoomId] = useState(defaults.roomId)
  const [capacity, setCapacity] = useState(defaults.capacity?.toString() ?? '')
  const [unnamed, setUnnamed] = useState(String(defaults.unnamedBookings))
  const [date, setDate] = useState(defaults.date)
  const [startTime, setStartTime] = useState(defaults.startTime)
  const [endTime, setEndTime] = useState(defaults.endTime)

  const course = courses.find(c => c.id === courseId)
  const room = rooms.find(r => r.id === roomId)
  const seats = parseCount(capacity)
  const unnamedSeats = isNew ? 0 : (parseCount(unnamed) ?? 0)
  const booked = unnamedSeats + named
  const planned = defaults.status === 'PLANNED'

  const busy = useRoomBusy(
    planned && room !== undefined && room.kind !== 'ONLINE' && !!date && endTime > startTime
      ? { roomId, date, startTime, endTime }
      : null,
    self
  )
  const mismatchError = useRoomMismatchError()

  const issues = sessionIssues({
    startTime,
    endTime,
    capacity: seats,
    booked,
    planned,
    room: room ?? null,
    needs: course?.needs ?? null,
  })
  const clientErrors: Partial<Record<string, ClientError>> = {}
  for (const issue of issues) Object.assign(clientErrors, errorOf(issue))
  if (busy) clientErrors['roomId'] ??= { key: 'room_busy' }

  /** Each field that can settle the issue, with what it says. */
  function errorOf(issue: SessionIssue): Partial<Record<string, ClientError>> {
    switch (issue.kind) {
      case 'END_BEFORE_START':
        return { endTime: { key: 'before_start' } }
      case 'BELOW_BOOKED': {
        const error: ClientError = { key: 'below_booked', values: { booked: issue.booked } }
        // Fewer unnamed seats settle it only where there are some.
        return unnamedSeats > 0 ? { capacity: error, unnamedBookings: error } : { capacity: error }
      }
      case 'ROOM': {
        const error = mismatchError(issue.mismatch, room?.name ?? '')
        // Too few seats: a bigger room or fewer seats. Anything else the room lacks: another
        // room, or a course that does not need it.
        return issue.mismatch.kind === 'TOO_SMALL'
          ? { roomId: error, capacity: error }
          : { roomId: error, courseId: error }
      }
    }
  }

  const label = useRoomLabel()
  const roomLabel = (r: RoomOption) => label(r, course?.needs ?? null, planned ? seats : null)

  const capacityHelp = [
    room?.capacity != null ? t('roomHolds', { seats: room.capacity }) : null,
    booked > 0 ? t('bookedSeats', { count: booked }) : null,
  ]
    .filter(Boolean)
    .join(' ')

  // Moving its bookings to another course does more than the form shows: ask first, saying
  // what happens to the people on it.
  const confirm = (): SaveConfirmation | null => {
    if (isNew || named === 0 || courseId === defaults.courseId) return null
    return {
      title: tq('courseTitle'),
      body: <p>{tq('courseBody', { count: named, course: course?.name ?? '' })}</p>,
      confirmLabel: tq('courseConfirm'),
      tone: 'primary',
    }
  }

  return (
    <FormShell
      writes="session"
      action={action}
      cancelHref={cancelHref}
      heading={heading}
      spec={isNew ? sessionCreateSpec : sessionEditSpec}
      isNew={isNew}
      clientErrors={clientErrors}
      submitLabel={isNew ? tsave('session') : tsave('changes')}
      savedMessage={isNew ? tsave('sessionCreated') : tsave('sessionSaved')}
      confirm={confirm}
    >
      <SelectField
        name="courseId"
        label={t('course')}
        required
        value={courseId}
        onValueChange={setCourseId}
        help={named > 0 ? t('courseKeepsBookings', { count: named }) : undefined}
        options={courses.map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
      />
      <FieldRow columns={3}>
        <DateField name="date" label={t('date')} required value={date} onValueChange={setDate} />
        <TimeField
          name="startTime"
          label={t('startTime')}
          required
          value={startTime}
          onValueChange={setStartTime}
        />
        <TimeField
          name="endTime"
          label={t('endTime')}
          required
          value={endTime}
          onValueChange={setEndTime}
        />
      </FieldRow>
      <SelectField
        name="roomId"
        label={t('room')}
        required
        value={roomId}
        onValueChange={setRoomId}
        options={rooms.map(r => ({ value: r.id, label: roomLabel(r) }))}
      />
      <FieldRow columns={3}>
        <TextField
          name="capacity"
          inputMode="numeric"
          label={t('capacity')}
          required
          help={capacityHelp || undefined}
          value={capacity}
          onChange={event => {
            setCapacity(event.target.value)
          }}
        />
        {!isNew && (
          <TextField
            name="unnamedBookings"
            inputMode="numeric"
            label={t('unnamedBookings')}
            help={t('unnamedHelp', { count: named })}
            value={unnamed}
            onChange={event => {
              setUnnamed(event.target.value)
            }}
          />
        )}
        <TextField
          name="pricePerPerson"
          inputMode="decimal"
          label={t('pricePerPerson', { currency: currencySymbol() })}
          defaultValue={formatAmount(defaults.pricePerPerson)}
          placeholder={tp('price')}
        />
      </FieldRow>
    </FormShell>
  )
}
