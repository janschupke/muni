'use client'

import { EMPLOYMENT_STATUSES } from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { employeeSpec } from '@/lib/form-inputs'

import type { FormProps, Option } from './form-props'
import {
  CheckboxField,
  DateField,
  FormSection,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
} from './form-shell'

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
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.employee')
  const tp = useTranslations('forms.placeholders')
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
    <FormShell
      writes="person"
      {...shell}
      spec={employeeSpec}
      submitLabel={shell.isNew ? tsave('employee') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('employeeCreated') : tsave('employeeSaved')}
    >
      <FieldRow>
        <TextField
          name="firstName"
          label={t('firstName')}
          required
          defaultValue={defaults.firstName}
          autoComplete="off"
          placeholder={tp('firstName')}
        />
        <TextField
          name="lastName"
          label={t('lastName')}
          required
          defaultValue={defaults.lastName}
          autoComplete="off"
          placeholder={tp('lastName')}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          name="email"
          type="email"
          label={t('email')}
          defaultValue={defaults.email ?? ''}
          autoComplete="off"
          placeholder={tp('email')}
        />
        <TextField
          name="nationalId"
          label={t('nationalId')}
          help={t('nationalIdHelp')}
          defaultValue={defaults.nationalId ?? ''}
          autoComplete="off"
          placeholder={tp('nationalId')}
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
        <TextAreaField
          name="note"
          label={t('note')}
          defaultValue={defaults.note ?? ''}
          placeholder={tp('note')}
        />
      </FormSection>
    </FormShell>
  )
}
