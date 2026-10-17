'use client'

import { CAPABILITIES, type Capability } from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'

import { courseCreateSpec, courseEditSpec } from '@/lib/form-inputs'

import type { FormProps, Option } from './form-props'
import {
  CheckboxField,
  CheckboxGroupField,
  FormSection,
  FormShell,
  SelectField,
  TextField,
} from './form-shell'

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
}) {
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.course')
  const tp = useTranslations('forms.placeholders')
  const tc = useTranslations('status.capability')
  const derived = (value: number | null) =>
    value === null ? t('derivedNone') : t('derivedValue', { value })
  return (
    <FormShell
      writes="course"
      {...shell}
      isNew={isNew}
      spec={isNew ? courseCreateSpec : courseEditSpec}
      submitLabel={isNew ? tsave('course') : tsave('changes')}
      savedMessage={isNew ? tsave('courseCreated') : tsave('courseSaved')}
    >
      <FieldRow>
        {isNew && (
          <TextField
            name="code"
            label={t('code')}
            help={t('codeHelp')}
            required
            autoComplete="off"
            placeholder={tp('code')}
          />
        )}
        <TextField
          name="name"
          label={t('name')}
          required
          defaultValue={defaults.name}
          placeholder={tp('courseName')}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          name="validityMonths"
          label={t('validityMonths')}
          help={t('validityHelp')}
          inputMode="numeric"
          defaultValue={defaults.validityMonths ?? ''}
          placeholder={tp('months')}
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
