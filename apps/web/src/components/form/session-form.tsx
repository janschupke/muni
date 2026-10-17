'use client'

import type { CourseOption, RoomOption } from '@muni/db/repositories'
import { SESSION_STATUSES } from '@muni/domain/enums'
import { type SessionIssue, sessionIssues } from '@muni/domain/sessions'
import { FieldRow } from '@muni/ui/field'
import { currencySymbol } from '@muni/utils/format'
import { parseCount } from '@muni/utils/money'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { FormState } from '@/lib/form'
import { sessionCreateSpec, sessionEditSpec } from '@/lib/form-inputs'

import {
  type ClientError,
  DateField,
  type FormHeading,
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
  status: string
}

/** Which of the linked fields the user touched last: an error goes on that one. */
type Blame = 'roomId' | 'capacity' | 'courseId' | 'unnamedBookings'

/** Seats a room suggests for the course: its group size where the room holds it, else the room. */
function suggestedSeats(room: RoomOption, course: CourseOption | undefined): number | null {
  const group = course?.needs.groupSize ?? null
  if (room.capacity === null) return group
  return group === null ? room.capacity : Math.min(group, room.capacity)
}

/**
 * A session's form. The course, room and seats check each other as the user types, with the
 * same rules the server applies on save (`sessionIssues`): a room too small for the seats, one
 * lacking what the course needs, seats below the bookings. Whether the room is free then is
 * asked from the server as the user picks. Until the user types the seats, they follow the
 * room: a new session takes the room's suggestion, an edited one shrinks to fit a smaller room.
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
  mode = 'edit',
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  cancelHref: string
  heading: FormHeading
  courses: readonly CourseOption[]
  rooms: readonly RoomOption[]
  defaults: SessionDefaults
  /** The session being edited (its ID): it never clashes with itself. */
  self?: string | null | undefined
  /** Named bookings, managed on the session's page; they hold seats too. */
  named?: number | undefined
  /** A new session starts with no bookings: no unnamed seats to set. */
  mode?: 'edit' | 'create' | undefined
}) {
  const t = useTranslations('forms.session')
  const tq = useTranslations('forms.session.confirm')
  const tsave = useTranslations('forms.save')
  const ts = useTranslations('status')
  const tp = useTranslations('forms.placeholders')
  const locale = useLocale()

  const [courseId, setCourseId] = useState(defaults.courseId)
  const [roomId, setRoomId] = useState(defaults.roomId)
  const [capacity, setCapacity] = useState(defaults.capacity?.toString() ?? '')
  const [capacityTyped, setCapacityTyped] = useState(false)
  const [unnamed, setUnnamed] = useState(String(defaults.unnamedBookings))
  const [date, setDate] = useState(defaults.date)
  const [startTime, setStartTime] = useState(defaults.startTime)
  const [endTime, setEndTime] = useState(defaults.endTime)
  const [status, setStatus] = useState(defaults.status)
  const [blame, setBlame] = useState<Blame>('roomId')

  const course = courses.find(c => c.id === courseId)
  const room = rooms.find(r => r.id === roomId)
  const seats = parseCount(capacity)
  const booked = (mode === 'edit' ? (parseCount(unnamed) ?? 0) : 0) + named
  const planned = status === 'PLANNED'

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

  function errorOf(issue: SessionIssue): Partial<Record<string, ClientError>> {
    switch (issue.kind) {
      case 'END_BEFORE_START':
        return { endTime: { key: 'before_start' } }
      case 'BELOW_BOOKED':
        return {
          [blame === 'unnamedBookings' ? 'unnamedBookings' : 'capacity']: {
            key: 'below_booked',
            values: { booked: issue.booked },
          },
        }
      case 'ROOM': {
        const m = issue.mismatch
        // Too few seats is the seats' fault if the user just typed them, otherwise the room's;
        // anything else the room lacks is the room's, or the course's if that just changed.
        const field =
          m.kind === 'TOO_SMALL'
            ? blame === 'capacity'
              ? 'capacity'
              : 'roomId'
            : blame === 'courseId'
              ? 'courseId'
              : 'roomId'
        return { [field]: mismatchError(m, room?.name ?? '') }
      }
    }
  }

  function chooseRoom(id: string) {
    setRoomId(id)
    setBlame('roomId')
    const next = rooms.find(r => r.id === id)
    if (!next || capacityTyped) return
    if (mode === 'create') {
      const suggested = suggestedSeats(next, course)
      if (suggested !== null) setCapacity(String(suggested))
    } else if (next.capacity !== null && seats !== null && seats > next.capacity) {
      setCapacity(String(Math.max(next.capacity, booked)))
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

  // Cancelling a session, or moving its bookings to another course, does more than the form
  // shows: ask first, saying what happens to the people on it.
  const confirm = (): SaveConfirmation | null => {
    if (mode !== 'edit') return null
    const cancelling = status === 'CANCELLED' && defaults.status !== 'CANCELLED'
    const moving = named > 0 && courseId !== defaults.courseId
    if (!cancelling && !moving) return null
    const body = (
      <>
        {cancelling && <p>{tq('cancelBody', { count: named })}</p>}
        {moving && <p>{tq('courseBody', { count: named, course: course?.name ?? '' })}</p>}
      </>
    )
    return {
      title: cancelling ? tq('cancelTitle') : tq('courseTitle'),
      body,
      confirmLabel: cancelling
        ? moving
          ? tq('bothConfirm')
          : tq('cancelConfirm')
        : tq('courseConfirm'),
      tone: cancelling ? 'danger' : 'primary',
    }
  }

  return (
    <FormShell
      action={action}
      cancelHref={cancelHref}
      heading={heading}
      spec={mode === 'create' ? sessionCreateSpec : sessionEditSpec}
      isNew={mode === 'create'}
      clientErrors={clientErrors}
      submitLabel={mode === 'create' ? tsave('session') : tsave('changes')}
      savedMessage={mode === 'create' ? tsave('sessionCreated') : tsave('sessionSaved')}
      confirm={confirm}
    >
      <SelectField
        name="courseId"
        label={t('course')}
        required
        value={courseId}
        onValueChange={id => {
          setCourseId(id)
          setBlame('courseId')
        }}
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
      <FieldRow>
        <SelectField
          name="roomId"
          label={t('room')}
          required
          value={roomId}
          onValueChange={chooseRoom}
          options={rooms.map(r => ({ value: r.id, label: roomLabel(r) }))}
        />
        <SelectField
          name="status"
          label={t('status')}
          required
          value={status}
          onValueChange={setStatus}
          options={SESSION_STATUSES.map(s => ({ value: s, label: ts(`session.${s}`) }))}
        />
      </FieldRow>
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
            setCapacityTyped(true)
            setBlame('capacity')
          }}
        />
        {mode === 'edit' && (
          <TextField
            name="unnamedBookings"
            inputMode="numeric"
            label={t('unnamedBookings')}
            help={t('unnamedHelp', { count: named })}
            value={unnamed}
            onChange={event => {
              setUnnamed(event.target.value)
              setBlame('unnamedBookings')
            }}
          />
        )}
        <TextField
          name="pricePerPerson"
          inputMode="decimal"
          label={t('pricePerPerson', { currency: currencySymbol(locale) })}
          defaultValue={defaults.pricePerPerson ?? ''}
          placeholder={tp('price')}
        />
      </FieldRow>
    </FormShell>
  )
}
