'use client'

import {
  CAPABILITIES,
  type Capability,
  EMPLOYMENT_STATUSES,
  SESSION_STATUSES,
} from '@muni/domain/enums'
import { Alert } from '@muni/ui/alert'
import { FieldRow } from '@muni/ui/field'
import { currencySymbol } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'

import type { FormState } from '@/lib/form'

import {
  CheckboxField,
  CheckboxGroupField,
  DateField,
  type FormHeading,
  FormSection,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
  TimeField,
} from './form-shell'

type Action = (state: FormState, form: FormData) => Promise<FormState>

interface FormProps {
  action: Action
  cancelHref: string
  heading: FormHeading
}

interface Option {
  id: string
  name: string
}

export interface CourseDefaults {
  name: string
  validityMonths: number | null
  requiredForAll: boolean
  departmentIds: readonly string[]
  positionIds: readonly string[]
  sessionMinutes: number | null
  groupSize: number | null
  onlineAllowed: boolean
  capabilities: readonly Capability[]
}

/** A course: a new one also takes its code, which then never changes. */
export function CourseForm({
  defaults,
  departments,
  positions,
  isNew = false,
  ...shell
}: FormProps & {
  defaults: CourseDefaults
  departments: readonly Option[]
  positions: readonly Option[]
  isNew?: boolean | undefined
}) {
  const t = useTranslations('forms.course')
  const tc = useTranslations('status.capability')
  return (
    <FormShell {...shell}>
      <FieldRow>
        {isNew && (
          <TextField
            name="code"
            label={t('code')}
            help={t('codeHelp')}
            required
            autoComplete="off"
          />
        )}
        <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
      </FieldRow>
      <FieldRow>
        <TextField
          name="validityMonths"
          label={t('validityMonths')}
          help={t('validityHelp')}
          inputMode="numeric"
          defaultValue={defaults.validityMonths ?? ''}
        />
      </FieldRow>
      <FormSection title={t('audience')} description={t('audienceHelp')}>
        <CheckboxField
          name="requiredForAll"
          label={t('requiredForAll')}
          defaultChecked={defaults.requiredForAll}
        />
        <CheckboxGroupField
          name="departmentIds"
          label={t('departments')}
          options={departments.map(d => ({ value: d.id, label: d.name }))}
          defaultValue={defaults.departmentIds}
        />
        <CheckboxGroupField
          name="positionIds"
          label={t('positions')}
          options={positions.map(p => ({ value: p.id, label: p.name }))}
          defaultValue={defaults.positionIds}
        />
      </FormSection>
      <FormSection title={t('sessionNeeds')} description={t('sessionNeedsHelp')}>
        <FieldRow>
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
      </FormSection>
    </FormShell>
  )
}

export function SessionForm({
  defaults,
  rooms,
  courses,
  mode = 'edit',
  ...shell
}: FormProps & {
  rooms: readonly Option[]
  /** Offered when the course is not given by the page (a new session from the sessions list). */
  courses?: readonly { code: string; name: string }[] | undefined
  /** A new session starts empty: no other bookings to state. */
  mode?: 'edit' | 'create' | undefined
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
    <FormShell {...shell}>
      {courses && (
        <SelectField
          name="courseCode"
          label={t('course')}
          required
          options={courses.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
        />
      )}
      <FieldRow columns={3}>
        <DateField name="date" label={t('date')} required defaultValue={defaults.date} />
        <TimeField
          name="startTime"
          label={t('startTime')}
          required
          defaultValue={defaults.startTime}
        />
        <TimeField name="endTime" label={t('endTime')} required defaultValue={defaults.endTime} />
      </FieldRow>
      <FieldRow>
        <SelectField
          name="roomId"
          label={t('room')}
          required
          defaultValue={defaults.roomId}
          options={rooms.map(r => ({ value: r.id, label: r.name }))}
        />
        <SelectField
          name="status"
          label={t('status')}
          required
          defaultValue={defaults.status}
          options={SESSION_STATUSES.map(s => ({ value: s, label: ts(s) }))}
        />
      </FieldRow>
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
    </FormShell>
  )
}

export interface EmployeeDefaults {
  firstName: string
  lastName: string
  email: string | null
  nationalId: string | null
  departmentId: string | null
  positionId: string | null
  managerExternalId: string | null
  hiredOn: string
  leftOn: string | null
  status: string
  note: string | null
}

export function EmployeeForm({
  defaults,
  departments,
  positions,
  managers,
  ...shell
}: FormProps & {
  defaults: EmployeeDefaults
  departments: readonly Option[]
  positions: readonly Option[]
  /** Who can be the manager (the person themselves is left out by the page). */
  managers: readonly { externalId: string; name: string }[]
}) {
  const t = useTranslations('forms.employee')
  const ts = useTranslations('status.employment')
  return (
    <FormShell {...shell}>
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
      <FieldRow>
        <TextField
          name="email"
          type="email"
          label={t('email')}
          defaultValue={defaults.email ?? ''}
          autoComplete="off"
        />
        <TextField
          name="nationalId"
          label={t('nationalId')}
          help={t('nationalIdHelp')}
          defaultValue={defaults.nationalId ?? ''}
          autoComplete="off"
        />
      </FieldRow>
      <FormSection title={t('place')}>
        <FieldRow columns={3}>
          <SelectField
            name="departmentId"
            label={t('department')}
            allowEmpty
            defaultValue={defaults.departmentId ?? ''}
            options={departments.map(d => ({ value: d.id, label: d.name }))}
          />
          <SelectField
            name="positionId"
            label={t('position')}
            allowEmpty
            defaultValue={defaults.positionId ?? ''}
            options={positions.map(p => ({ value: p.id, label: p.name }))}
          />
          <SelectField
            name="managerExternalId"
            label={t('manager')}
            allowEmpty
            defaultValue={defaults.managerExternalId ?? ''}
            options={managers.map(m => ({ value: m.externalId, label: m.name }))}
          />
        </FieldRow>
      </FormSection>
      <FormSection title={t('employment')}>
        <FieldRow columns={3}>
          <SelectField
            name="status"
            label={t('status')}
            required
            defaultValue={defaults.status}
            options={EMPLOYMENT_STATUSES.map(s => ({ value: s, label: ts(s) }))}
          />
          <DateField name="hiredOn" label={t('hiredOn')} required defaultValue={defaults.hiredOn} />
          <DateField name="leftOn" label={t('leftOn')} defaultValue={defaults.leftOn} />
        </FieldRow>
        <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? ''} />
      </FormSection>
    </FormShell>
  )
}

export interface CompletionDefaults {
  courseCode: string
  completedOn: string
  validUntil: string | null
  provider: string | null
  price: number | null
  note: string | null
  /** From an import: the next import of the same record overwrites the changes. */
  imported: boolean
}

export function CompletionForm({
  courses,
  providers,
  defaults,
  ...shell
}: FormProps & {
  courses: { code: string; name: string }[]
  providers: string[]
  defaults: CompletionDefaults
}) {
  const t = useTranslations('forms.completion')
  const locale = useLocale()
  return (
    <FormShell {...shell}>
      {defaults.imported && <Alert tone="info">{t('importedHint')}</Alert>}
      <SelectField
        name="courseCode"
        label={t('course')}
        required
        defaultValue={defaults.courseCode}
        options={courses.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
      />
      <FieldRow>
        <DateField
          name="completedOn"
          label={t('completedOn')}
          required
          defaultValue={defaults.completedOn}
        />
        <DateField
          name="validUntil"
          label={t('validUntil')}
          help={t('validUntilHelp')}
          defaultValue={defaults.validUntil}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          name="provider"
          label={t('provider')}
          list="providers"
          autoComplete="off"
          defaultValue={defaults.provider ?? ''}
        />
        <TextField
          name="price"
          inputMode="decimal"
          label={t('price', { currency: currencySymbol(locale) })}
          defaultValue={defaults.price ?? ''}
        />
      </FieldRow>
      <datalist id="providers">
        {providers.map(p => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? ''} />
    </FormShell>
  )
}

/** A department's or a position's name: the only thing either has. */
export function GroupForm({ defaults, ...shell }: FormProps & { defaults: { name: string } }) {
  const t = useTranslations('forms.group')
  return (
    <FormShell {...shell}>
      <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
    </FormShell>
  )
}
