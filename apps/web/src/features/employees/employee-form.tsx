'use client'

import { EMPLOYMENT_STATUSES } from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  CheckboxField,
  DateField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/fields'
import type { ClientError } from '@/components/form/form-context'
import type { FormProps, Option } from '@/components/form/form-props'
import { FormSection, FormShell } from '@/components/form/form-shell'
import { employeeSpec } from '@/lib/form/form-inputs'

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
 * A person. The position must be one of the chosen department's, and only someone in a
 * department can lead it. A field never changes another: a department without the chosen
 * position, or a lead with no department, marks the fields at odds until the user settles it.
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
  const has = (id: string) => !departmentId || !!positionsByDepartment[departmentId]?.includes(id)
  // The chosen position stays listed even where the department lacks it, marked so.
  const offered = positions.filter(p => has(p.id) || p.id === positionId)
  const department = departments.find(d => d.id === departmentId)
  const position = positions.find(p => p.id === positionId)
  const head = departmentId ? heads[departmentId] : undefined
  const otherHead = head && !(defaults.leadsDepartment && departmentId === defaults.departmentId)

  const clientErrors: Partial<Record<string, ClientError>> = {}
  if (department && position && !has(position.id)) {
    const error: ClientError = {
      key: 'position_not_in_department',
      values: { department: department.name, position: position.name },
    }
    clientErrors['departmentId'] = error
    clientErrors['positionId'] = error
  }
  if (leads && !departmentId) {
    clientErrors['departmentId'] = { key: 'no_department' }
    clientErrors['leadsDepartment'] = { key: 'no_department' }
  }
  return (
    <FormShell
      writes="person"
      {...shell}
      spec={employeeSpec}
      clientErrors={clientErrors}
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
            onValueChange={setDepartmentId}
            options={departments.map(d => ({ value: d.id, label: d.name }))}
          />
          <SelectField
            name="positionId"
            label={t('position')}
            allowEmpty
            help={departmentId ? t('positionHelp') : undefined}
            value={positionId}
            onValueChange={setPositionId}
            options={offered.map(p => ({
              value: p.id,
              label: has(p.id) ? p.name : t('positionElsewhere', { name: p.name }),
            }))}
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
          disabled={!departmentId && !leads}
          checked={leads}
          onCheckedChange={setLeads}
          help={
            !departmentId
              ? leads
                ? undefined
                : t('leadsNeedsDepartment')
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
