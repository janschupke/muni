'use client'

import { Alert } from '@muni/ui/alert'
import { FieldRow } from '@muni/ui/field'
import { currencySymbol, formatAmount } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { FormProps, Option } from '@/components/form/form-props'
import {
  DateField,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-shell'
import { NEW_PROVIDER } from '@/lib/form/form'
import { completionSpec } from '@/lib/form/form-inputs'

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
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.completion')
  const tp = useTranslations('forms.placeholders')
  const [courseId, setCourseId] = useState(defaults.courseId)
  const [provider, setProvider] = useState(defaults.providerId ?? '')
  const months = courses.find(c => c.id === courseId)?.validityMonths ?? null
  const price = (
    <TextField
      name="price"
      inputMode="decimal"
      label={t('price', { currency: currencySymbol() })}
      defaultValue={formatAmount(defaults.price)}
      placeholder={tp('price')}
    />
  )
  return (
    <FormShell
      writes="person"
      {...shell}
      spec={completionSpec}
      submitLabel={shell.isNew ? tsave('completion') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('completionCreated') : tsave('completionSaved')}
    >
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
            placeholder={tp('providerName')}
          />
        ) : (
          price
        )}
      </FieldRow>
      {provider === NEW_PROVIDER && <FieldRow>{price}</FieldRow>}
      <TextAreaField
        name="note"
        label={t('note')}
        defaultValue={defaults.note ?? ''}
        placeholder={tp('note')}
      />
    </FormShell>
  )
}
