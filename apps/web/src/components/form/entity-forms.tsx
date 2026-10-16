'use client'

import { EMPLOYMENT_STATUSES, SESSION_STATUSES } from '@muni/domain/enums'
import { useTranslations } from 'next-intl'

import type { FormState } from '@/lib/form'

import { CheckboxField, FormShell, SelectField, TextAreaField, TextField } from './form-shell'

type Action = (state: FormState, form: FormData) => Promise<FormState>

export function CourseForm({
  action,
  cancelHref,
  defaults,
}: {
  action: Action
  cancelHref: string
  defaults: { name: string; validityMonths: number | null }
}) {
  const t = useTranslations('forms.course')
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
    </FormShell>
  )
}

export function SessionForm({
  action,
  cancelHref,
  defaults,
}: {
  action: Action
  cancelHref: string
  defaults: {
    date: string
    startTime: string
    endTime: string
    location: string
    isOnline: boolean
    capacity: number
    bookedCount: number
    pricePerPerson: number | null
    status: string
  }
}) {
  const t = useTranslations('forms.session')
  const ts = useTranslations('status.session')
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>
      <TextField name="location" label={t('location')} required defaultValue={defaults.location} />
      <CheckboxField name="isOnline" label={t('isOnline')} defaultChecked={defaults.isOnline} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="capacity"
          inputMode="numeric"
          label={t('capacity')}
          required
          defaultValue={defaults.capacity}
        />
        <TextField
          name="bookedCount"
          inputMode="numeric"
          label={t('bookedCount')}
          defaultValue={defaults.bookedCount}
        />
        <TextField
          name="pricePerPerson"
          inputMode="decimal"
          label={t('pricePerPerson')}
          defaultValue={defaults.pricePerPerson ?? ''}
        />
      </div>
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
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <TextField
        name="email"
        type="email"
        label={t('email')}
        defaultValue={defaults.email ?? ''}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>
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
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <SelectField
        name="courseCode"
        label={t('course')}
        required
        options={courses.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="provider" label={t('provider')} list="providers" autoComplete="off" />
        <TextField name="price" inputMode="decimal" label={t('price')} />
      </div>
      <datalist id="providers">
        {providers.map(p => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <TextAreaField name="note" label={t('note')} />
    </FormShell>
  )
}
