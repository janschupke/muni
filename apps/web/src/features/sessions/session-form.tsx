'use client'

import type { CourseOption, RoomOption } from '@muni/db/repositories'
import type { CourseOffering } from '@muni/domain/planner'
import { sessionEndTime, type SessionIssue, sessionIssues } from '@muni/domain/sessions'
import { FieldRow, FieldValue } from '@muni/ui/field'
import { formatCurrency } from '@muni/utils/format'
import { parseCount } from '@muni/utils/money'
import { compareCs } from '@muni/utils/text'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { FormProps } from '@/components/form/form-props'
import {
  type ClientError,
  DateField,
  FormShell,
  type SaveConfirmation,
  SelectField,
  TextField,
  TimeField,
} from '@/components/form/form-shell'
import { sessionCreateSpec, sessionEditSpec } from '@/lib/form/form-inputs'

import { useRoomLabel } from './room-label'
import { useRoomBusy, useRoomMismatchError } from './session-checks'

export interface SessionDefaults {
  courseId: string
  /** '' on a new session with nobody chosen yet. */
  providerId: string
  /** The provider as stored, by name (it may no longer offer the course). */
  providerName?: string | undefined
  date: string
  startTime: string
  /** The stored end: kept while the course and the start stay as they are. */
  endTime: string
  roomId: string
  /** null on a new session of a course with no seats set: the seats are for the user to set. */
  capacity: number | null
  unnamedBookings: number
  /** The stored price: kept while the course and the provider stay as they are. */
  pricePerPerson: number | null
  /**
   * As stored; the form never changes it (cancelling and reinstating are their own acts). A
   * cancelled session holds no room, so its room is not checked.
   */
  status: 'PLANNED' | 'CANCELLED'
}

/** A course's providers as the form offers them: the default first, then by name. */
const byDefaultThenName = (a: CourseOffering, b: CourseOffering) =>
  Number(b.isDefault) - Number(a.isDefault) || compareCs(a.providerName, b.providerName)

/**
 * A session's form. What follows from the course and the provider is shown, not typed: the end
 * (the course's length after the start) and the price (the provider's for the course, fixed
 * when the session is scheduled). The course, provider, room and seats check each other as the
 * user types, with the same rules the server applies on save (`sessionIssues`): a provider that
 * does not offer the course, a course with no length, a room too small for the seats or lacking
 * what the course needs, seats below the bookings. Whether the room is free then is asked from
 * the server as the user picks. A field never changes another: a conflict marks every field that
 * can settle it, and the form is not sent until one does.
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

  const busy = useRoomBusy(
    planned && room !== undefined && room.kind !== 'ONLINE' && !!date && end && !end.nextDay
      ? { roomId, date, startTime, endTime: end.time }
      : null,
    self
  )
  const mismatchError = useRoomMismatchError()

  const issues = sessionIssues({
    minutes: course && !sameTime ? (minutes ?? null) : undefined,
    offered: course && providerId && !sameOffer ? offering !== undefined : undefined,
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

  const providerOptions = [
    ...offerings.map(o => ({
      value: o.providerId,
      label: t(o.isDefault ? 'providerOptionDefault' : 'providerOption', {
        name: o.providerName,
        price: formatCurrency(o.price),
      }),
    })),
    // The provider it has, though it no longer offers the course: kept until changed.
    ...(sameCourse && defaults.providerName && !offerings.some(o => o.providerId === providerId)
      ? [
          {
            value: defaults.providerId,
            label: t('providerGone', { name: defaults.providerName }),
          },
        ]
      : []),
  ]

  const capacityHelp = [
    course?.needs.seats != null ? t('seatsDefault', { seats: course.needs.seats }) : null,
    room?.capacity != null ? t('roomHolds', { seats: room.capacity }) : null,
    booked > 0 ? t('bookedSeats', { count: booked }) : null,
  ]
    .filter(Boolean)
    .join(' ')

  // Moving its bookings to another course, or charging them another price, does more than the
  // form shows: ask first, saying what happens to the people on it.
  const confirm = (): SaveConfirmation | null => {
    if (isNew || named === 0) return null
    const moving = courseId !== defaults.courseId
    const repriced = !sameOffer && price !== defaults.pricePerPerson
    if (!moving && !repriced) return null
    return {
      title: moving ? tq('courseTitle') : tq('priceTitle'),
      body: (
        <>
          {moving && <p>{tq('courseBody', { count: named, course: course?.name ?? '' })}</p>}
          {repriced && (
            <p>
              {tq('priceBody', {
                count: named,
                price: formatCurrency(price),
                was: formatCurrency(defaults.pricePerPerson),
              })}
            </p>
          )}
        </>
      ),
      confirmLabel: moving ? tq('courseConfirm') : tq('priceConfirm'),
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
      <FieldRow>
        <SelectField
          name="courseId"
          label={t('course')}
          required
          value={courseId}
          onValueChange={setCourseId}
          help={named > 0 ? t('courseKeepsBookings', { count: named }) : undefined}
          options={courses.map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
        />
        <SelectField
          name="providerId"
          label={t('provider')}
          required
          value={providerId}
          onValueChange={setProviderId}
          help={course && offerings.length === 0 ? t('noProviders') : t('providerHelp')}
          options={providerOptions}
        />
      </FieldRow>
      <FieldRow columns={3}>
        <DateField name="date" label={t('date')} required value={date} onValueChange={setDate} />
        <TimeField
          name="startTime"
          label={t('startTime')}
          required
          value={startTime}
          onValueChange={setStartTime}
        />
        <FieldValue
          label={t('endTime')}
          help={sameTime ? t('endKept') : minutes != null ? t('endHelp', { minutes }) : undefined}
        >
          {end === null
            ? t('noLength')
            : end.nextDay
              ? t('endNextDay', { time: end.time })
              : end.time}
        </FieldValue>
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
        <FieldValue label={t('price')} help={sameOffer ? t('priceKept') : t('priceHelp')}>
          {price === null
            ? t('priceNone')
            : !isNew && !sameOffer && price !== defaults.pricePerPerson
              ? t('priceChanged', {
                  price: formatCurrency(price),
                  was: formatCurrency(defaults.pricePerPerson),
                })
              : formatCurrency(price)}
        </FieldValue>
      </FieldRow>
    </FormShell>
  )
}
