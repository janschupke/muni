'use client'

import { CAPABILITIES, type Capability, EMPLOYMENT_STATUSES } from '@muni/domain/enums'
import { Alert } from '@muni/ui/alert'
import { FieldRow } from '@muni/ui/field'
import { currencySymbol } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { type FormState, NEW_PROVIDER } from '@/lib/form'

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
  /** The app's overrides; null = what the sessions import derived (`derived`) applies. */
  sessionMinutes: number | null
  groupSize: number | null
  onlineAllowed: boolean | null
  derived: { sessionMinutes: number | null; groupSize: number | null; onlineAllowed: boolean }
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
  const derived = (value: number | null) =>
    value === null ? t('derivedNone') : t('derivedValue', { value })
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
        <FieldRow columns={3}>
          <TextField
            name="sessionMinutes"
            label={t('sessionMinutes')}
            inputMode="numeric"
            help={derived(defaults.derived.sessionMinutes)}
            placeholder={defaults.derived.sessionMinutes?.toString()}
            defaultValue={defaults.sessionMinutes ?? ''}
          />
          <TextField
            name="groupSize"
            label={t('groupSize')}
            inputMode="numeric"
            help={derived(defaults.derived.groupSize)}
            placeholder={defaults.derived.groupSize?.toString()}
            defaultValue={defaults.groupSize ?? ''}
          />
          <SelectField
            name="onlineAllowed"
            label={t('onlineAllowed')}
            required
            defaultValue={
              defaults.onlineAllowed === null ? 'derived' : defaults.onlineAllowed ? 'yes' : 'no'
            }
            options={[
              {
                value: 'derived',
                label: t('onlineDerived', { value: String(defaults.derived.onlineAllowed) }),
              },
              { value: 'yes', label: t('onlineYes') },
              { value: 'no', label: t('onlineNo') },
            ]}
          />
        </FieldRow>
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

export interface EmployeeDefaults {
  firstName: string
  lastName: string
  email: string | null
  nationalId: string | null
  departmentId: string | null
  positionId: string | null
  managerId: string | null
  leadsDepartment: boolean
  hiredOn: string
  leftOn: string | null
  status: string
  note: string | null
}

/**
 * A person. The position is one of the chosen department's (a department change clears a
 * position it does not have, and the person no longer leads the department they left).
 */
export function EmployeeForm({
  defaults,
  departments,
  positions,
  positionsByDepartment,
  managers,
  heads,
  ...shell
}: FormProps & {
  defaults: EmployeeDefaults
  departments: readonly Option[]
  positions: readonly Option[]
  /** Which positions each department has. */
  positionsByDepartment: Readonly<Record<string, readonly string[]>>
  /** Who can be the manager (the person themselves is left out by the page). */
  managers: readonly Option[]
  /** Who leads each department now, by department id. */
  heads: Readonly<Record<string, string>>
}) {
  const t = useTranslations('forms.employee')
  const ts = useTranslations('status.employment')
  const [departmentId, setDepartmentId] = useState(defaults.departmentId ?? '')
  const [positionId, setPositionId] = useState(defaults.positionId ?? '')
  const [leads, setLeads] = useState(defaults.leadsDepartment)
  const [cleared, setCleared] = useState(false)
  const offered = departmentId
    ? positions.filter(p => positionsByDepartment[departmentId]?.includes(p.id))
    : positions
  const head = departmentId ? heads[departmentId] : undefined
  const otherHead = head && !(defaults.leadsDepartment && departmentId === defaults.departmentId)
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
            value={departmentId}
            onValueChange={id => {
              setDepartmentId(id)
              if (id !== defaults.departmentId) setLeads(false)
              const kept = !id || !positionId || positionsByDepartment[id]?.includes(positionId)
              if (!kept) setPositionId('')
              setCleared(!kept)
            }}
            options={departments.map(d => ({ value: d.id, label: d.name }))}
          />
          <SelectField
            name="positionId"
            label={t('position')}
            allowEmpty
            help={cleared ? t('positionCleared') : departmentId ? t('positionHelp') : undefined}
            value={positionId}
            onValueChange={id => {
              setPositionId(id)
              setCleared(false)
            }}
            options={offered.map(p => ({ value: p.id, label: p.name }))}
          />
          <SelectField
            name="managerId"
            label={t('manager')}
            allowEmpty
            defaultValue={defaults.managerId ?? ''}
            options={managers.map(m => ({ value: m.id, label: m.name }))}
          />
        </FieldRow>
        <CheckboxField
          name="leadsDepartment"
          label={t('leadsDepartment')}
          disabled={!departmentId}
          checked={leads && !!departmentId}
          onCheckedChange={setLeads}
          help={
            !departmentId
              ? t('leadsNeedsDepartment')
              : otherHead && leads
                ? t('leadsReplaces', { name: head })
                : otherHead
                  ? t('leadsNow', { name: head })
                  : undefined
          }
        />
      </FormSection>
      <FormSection title={t('employment')}>
        <FieldRow columns={3}>
          <SelectField
            name="status"
            label={t('status')}
            required
            help={t('statusHelp')}
            defaultValue={defaults.status}
            options={EMPLOYMENT_STATUSES.map(s => ({ value: s, label: ts(s) }))}
          />
          <DateField name="hiredOn" label={t('hiredOn')} required defaultValue={defaults.hiredOn} />
          <DateField
            name="leftOn"
            label={t('leftOn')}
            help={t('leftOnHelp')}
            defaultValue={defaults.leftOn}
          />
        </FieldRow>
        <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? ''} />
      </FormSection>
    </FormShell>
  )
}

export interface CompletionDefaults {
  employeeId: string
  courseId: string
  completedOn: string
  /** null = from the course's validity. */
  validUntil: string | null
  providerId: string | null
  price: number | null
  note: string | null
  /** From an import: the next import of the same record overwrites the changes. */
  imported: boolean
}

/**
 * A completion: who, which course, when, by whom. The provider is picked, or named as a new
 * one on purpose ("New provider…"): a typed name is never matched to a provider silently.
 */
export function CompletionForm({
  employees,
  courses,
  providers,
  defaults,
  ...shell
}: FormProps & {
  employees: readonly Option[]
  courses: readonly { id: string; code: string; name: string; validityMonths: number | null }[]
  providers: readonly Option[]
  defaults: CompletionDefaults
}) {
  const t = useTranslations('forms.completion')
  const locale = useLocale()
  const [courseId, setCourseId] = useState(defaults.courseId)
  const [provider, setProvider] = useState(defaults.providerId ?? '')
  const months = courses.find(c => c.id === courseId)?.validityMonths ?? null
  return (
    <FormShell {...shell}>
      {defaults.imported && <Alert tone="info">{t('importedHint')}</Alert>}
      <FieldRow>
        <SelectField
          name="employeeId"
          label={t('employee')}
          required
          defaultValue={defaults.employeeId}
          options={employees.map(e => ({ value: e.id, label: e.name }))}
        />
        <SelectField
          name="courseId"
          label={t('course')}
          required
          value={courseId}
          onValueChange={setCourseId}
          options={courses.map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
        />
      </FieldRow>
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
          help={
            courseId
              ? months === null
                ? t('validUntilNever')
                : t('validUntilFromCourse', { months })
              : t('validUntilHelp')
          }
          defaultValue={defaults.validUntil}
        />
      </FieldRow>
      <FieldRow>
        <SelectField
          name="providerId"
          label={t('provider')}
          allowEmpty
          value={provider}
          onValueChange={setProvider}
          options={[
            ...providers.map(p => ({ value: p.id, label: p.name })),
            { value: NEW_PROVIDER, label: t('newProvider') },
          ]}
        />
        {provider === NEW_PROVIDER ? (
          <TextField
            name="newProviderName"
            label={t('newProviderName')}
            help={t('newProviderHelp')}
            required
            autoComplete="off"
          />
        ) : (
          <TextField
            name="price"
            inputMode="decimal"
            label={t('price', { currency: currencySymbol(locale) })}
            defaultValue={defaults.price ?? ''}
          />
        )}
      </FieldRow>
      {provider === NEW_PROVIDER && (
        <FieldRow>
          <TextField
            name="price"
            inputMode="decimal"
            label={t('price', { currency: currencySymbol(locale) })}
            defaultValue={defaults.price ?? ''}
          />
        </FieldRow>
      )}
      <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? ''} />
    </FormShell>
  )
}

/** A department: its name, and who leads it (one of its members). */
export function DepartmentForm({
  defaults,
  members,
  ...shell
}: FormProps & {
  defaults: { name: string; headId: string | null }
  /** Its members who can lead it; none on a new department. */
  members: readonly Option[]
}) {
  const t = useTranslations('forms.group')
  return (
    <FormShell {...shell}>
      <FieldRow>
        <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
        <SelectField
          name="headId"
          label={t('head')}
          allowEmpty
          help={members.length === 0 ? t('headNoMembers') : t('headHelp')}
          defaultValue={defaults.headId ?? ''}
          options={members.map(m => ({ value: m.id, label: m.name }))}
        />
      </FieldRow>
    </FormShell>
  )
}

/** A position: its name, and the departments it exists in. */
export function PositionForm({
  defaults,
  departments,
  ...shell
}: FormProps & {
  defaults: { name: string; departmentIds: readonly string[] }
  departments: readonly Option[]
}) {
  const t = useTranslations('forms.group')
  return (
    <FormShell {...shell}>
      <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
      <CheckboxGroupField
        name="departmentIds"
        label={t('departments')}
        help={t('departmentsHelp')}
        options={departments.map(d => ({ value: d.id, label: d.name }))}
        defaultValue={defaults.departmentIds}
      />
    </FormShell>
  )
}
