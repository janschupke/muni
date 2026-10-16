'use client'

import {
  CAPABILITIES,
  EMPLOYMENT_STATUSES,
  SESSION_STATUSES,
  type Capability,
} from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { currencySymbol } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'

import type { FormState } from '@/lib/form'

import {
  CheckboxField,
  CheckboxGroupField,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
} from './form-shell'

type Action = (state: FormState, form: FormData) => Promise<FormState>

export function CourseForm({
  action,
  cancelHref,
  defaults,
}: {
  action: Action
  cancelHref: string
  defaults: {
    name: string
    validityMonths: number | null
    sessionMinutes: number | null
    groupSize: number | null
    onlineAllowed: boolean
    capabilities: readonly Capability[]
  }
}) {
  const t = useTranslations('forms.course')
  const tc = useTranslations('status.capability')
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
      <TextField
        name="validityMonths"
        label={t('validityMonths')}
        help={t('validityHelp')}
        inputMode="numeric"
        defaultValue={defaults.validityMonths ?? ''}
        className="max-w-48"
      />
      <fieldset className="flex flex-col gap-4 border-t border-border-muted pt-4">
        <legend className="sr-only">{t('sessionNeeds')}</legend>
        <div aria-hidden>
          <p className="text-sm font-semibold text-fg">{t('sessionNeeds')}</p>
          <p className="text-xs text-fg-muted">{t('sessionNeedsHelp')}</p>
        </div>
        <FieldRow columns={2}>
          <TextField
            name="sessionMinutes"
            label={t('sessionMinutes')}
            inputMode="numeric"
            defaultValue={defaults.sessionMinutes ?? ''}
          />
          <TextField
            name="groupSize"
            label={t('groupSize')}
            inputMode="numeric"
            defaultValue={defaults.groupSize ?? ''}
          />
        </FieldRow>
        <CheckboxField
          name="onlineAllowed"
          label={t('onlineAllowed')}
          defaultChecked={defaults.onlineAllowed}
        />
        <CheckboxGroupField
          name="capabilities"
          label={t('capabilities')}
          options={CAPABILITIES.map(c => ({ value: c, label: tc(c) }))}
          defaultValue={defaults.capabilities}
        />
      </fieldset>
    </FormShell>
  )
}

export function SessionForm({
  action,
  cancelHref,
  defaults,
  rooms,
  mode = 'edit',
}: {
  action: Action
  cancelHref: string
  rooms: readonly { id: string; name: string }[]
  /** A new session starts empty: no other bookings to state. */
  mode?: 'edit' | 'create'
  defaults: {
    date: string
    startTime: string
    endTime: string
    roomId: string
    /** null on a new session of a course with no group size: the seats are for the user to set. */
    capacity: number | null
    unnamedBookings: number
    /** Named bookings, shown next to the unnamed ones (managed as assignments). */
    assignedCount: number
    pricePerPerson: number | null
    status: string
  }
}) {
  const t = useTranslations('forms.session')
  const ts = useTranslations('status.session')
  const locale = useLocale()
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <FieldRow columns={3}>
        <TextField
          name="date"
          type="date"
          label={t('date')}
          required
          defaultValue={defaults.date}
        />
        <TextField
          name="startTime"
          type="time"
          label={t('startTime')}
          required
          defaultValue={defaults.startTime}
        />
        <TextField
          name="endTime"
          type="time"
          label={t('endTime')}
          required
          defaultValue={defaults.endTime}
        />
      </FieldRow>
      <SelectField
        name="roomId"
        label={t('room')}
        required
        defaultValue={defaults.roomId}
        options={rooms.map(r => ({ value: r.id, label: r.name }))}
      />
      <FieldRow columns={3}>
        <TextField
          name="capacity"
          inputMode="numeric"
          label={t('capacity')}
          required
          defaultValue={defaults.capacity ?? ''}
        />
        {mode === 'edit' && (
          <TextField
            name="unnamedBookings"
            inputMode="numeric"
            label={t('unnamedBookings')}
            help={t('unnamedHelp', { count: defaults.assignedCount })}
            defaultValue={defaults.unnamedBookings}
          />
        )}
        <TextField
          name="pricePerPerson"
          inputMode="decimal"
          label={t('pricePerPerson', { currency: currencySymbol(locale) })}
          defaultValue={defaults.pricePerPerson ?? ''}
        />
      </FieldRow>
      <SelectField
        name="status"
        label={t('status')}
        required
        defaultValue={defaults.status}
        options={SESSION_STATUSES.map(s => ({ value: s, label: ts(s) }))}
      />
    </FormShell>
  )
}

export function EmployeeForm({
  action,
  cancelHref,
  defaults,
  departments,
  positions,
}: {
  action: Action
  cancelHref: string
  defaults: {
    firstName: string
    lastName: string
    email: string | null
    department: string | null
    position: string | null
    hiredOn: string
    leftOn: string | null
    status: string
    note: string | null
  }
  departments: string[]
  positions: string[]
}) {
  const t = useTranslations('forms.employee')
  const ts = useTranslations('status.employment')
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <FieldRow>
        <TextField
          name="firstName"
          label={t('firstName')}
          required
          defaultValue={defaults.firstName}
          autoComplete="off"
        />
        <TextField
          name="lastName"
          label={t('lastName')}
          required
          defaultValue={defaults.lastName}
          autoComplete="off"
        />
      </FieldRow>
      <TextField
        name="email"
        type="email"
        label={t('email')}
        defaultValue={defaults.email ?? ''}
        autoComplete="off"
      />
      <FieldRow>
        <SelectField
          name="department"
          label={t('department')}
          allowEmpty
          defaultValue={defaults.department ?? ''}
          options={departments.map(d => ({ value: d, label: d }))}
        />
        <SelectField
          name="position"
          label={t('position')}
          allowEmpty
          defaultValue={defaults.position ?? ''}
          options={positions.map(p => ({ value: p, label: p }))}
        />
      </FieldRow>
      <FieldRow columns={3}>
        <SelectField
          name="status"
          label={t('status')}
          required
          defaultValue={defaults.status}
          options={EMPLOYMENT_STATUSES.map(s => ({ value: s, label: ts(s) }))}
        />
        <TextField
          name="hiredOn"
          type="date"
          label={t('hiredOn')}
          required
          defaultValue={defaults.hiredOn}
        />
        <TextField
          name="leftOn"
          type="date"
          label={t('leftOn')}
          defaultValue={defaults.leftOn ?? ''}
        />
      </FieldRow>
      <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? ''} />
    </FormShell>
  )
}

export function CompletionForm({
  action,
  cancelHref,
  courses,
  providers,
  today,
}: {
  action: Action
  cancelHref: string
  courses: { code: string; name: string }[]
  providers: string[]
  today: string
}) {
  const t = useTranslations('forms.completion')
  const locale = useLocale()
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <SelectField
        name="courseCode"
        label={t('course')}
        required
        options={courses.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
      />
      <FieldRow>
        <TextField
          name="completedOn"
          type="date"
          label={t('completedOn')}
          required
          defaultValue={today}
        />
        <TextField
          name="validUntil"
          type="date"
          label={t('validUntil')}
          help={t('validUntilHelp')}
        />
      </FieldRow>
      <FieldRow>
        <TextField name="provider" label={t('provider')} list="providers" autoComplete="off" />
        <TextField
          name="price"
          inputMode="decimal"
          label={t('price', { currency: currencySymbol(locale) })}
        />
      </FieldRow>
      <datalist id="providers">
        {providers.map(p => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <TextAreaField name="note" label={t('note')} />
    </FormShell>
  )
}
