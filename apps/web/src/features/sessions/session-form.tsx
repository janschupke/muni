'use client'

import type { CourseOption, RoomOption } from '@muni/db/repositories'
import { FieldRow, FieldValue } from '@muni/ui/field'
import { formatCurrency } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { DateField, SelectField, TextField, TimeField } from '@/components/form/fields'
import type { FormProps } from '@/components/form/form-props'
import { FormShell } from '@/components/form/form-shell'
import { sessionCreateSpec, sessionEditSpec } from '@/lib/form/form-inputs'

import { useRoomLabel } from './room-label'
import { useSessionConfirm } from './session-confirm'
import { useSessionDraft } from './session-draft'

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
  const tsave = useTranslations('forms.save')

  const draft = useSessionDraft({
    courses,
    rooms,
    defaults,
    isNew,
    named,
    self: self ?? null,
  })
  const {
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
    booked,
    planned,
    sameCourse,
    sameOffer,
    sameTime,
    offerings,
    minutes,
    end,
    price,
  } = draft

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

  const confirm = useSessionConfirm({ draft, defaults, isNew, named })

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
