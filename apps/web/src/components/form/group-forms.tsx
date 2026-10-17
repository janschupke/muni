'use client'

import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'

import { departmentSpec, positionSpec } from '@/lib/form-inputs'

import type { FormProps, Option } from './form-props'
import { CheckboxGroupField, FormShell, SelectField, TextField } from './form-shell'

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
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.group')
  const tp = useTranslations('forms.placeholders')
  return (
    <FormShell
      writes="group"
      {...shell}
      spec={departmentSpec}
      submitLabel={shell.isNew ? tsave('department') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('departmentCreated') : tsave('departmentSaved')}
    >
      <FieldRow>
        <TextField
          name="name"
          label={t('name')}
          required
          defaultValue={defaults.name}
          placeholder={tp('departmentName')}
        />
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
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.group')
  const tp = useTranslations('forms.placeholders')
  return (
    <FormShell
      writes="group"
      {...shell}
      spec={positionSpec}
      submitLabel={shell.isNew ? tsave('position') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('positionCreated') : tsave('positionSaved')}
    >
      <TextField
        name="name"
        label={t('name')}
        required
        defaultValue={defaults.name}
        placeholder={tp('positionName')}
      />
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
