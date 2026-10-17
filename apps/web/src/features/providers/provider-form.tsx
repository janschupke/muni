'use client'

import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'

import { type FormHeading, FormShell, TextAreaField, TextField } from '@/components/form/form-shell'
import type { FormState } from '@/lib/form'
import { providerSpec } from '@/lib/form-inputs'

export interface ProviderDefaults {
  name: string
  companyId: string | null
  email: string | null
  phone: string | null
  website: string | null
  note: string | null
}

export function ProviderForm({
  defaults,
  ...shell
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  cancelHref: string
  heading: FormHeading
  defaults: ProviderDefaults
  isNew?: boolean | undefined
}) {
  const tsave = useTranslations('forms.save')
  const t = useTranslations('providers.form')
  const tp = useTranslations('forms.placeholders')
  return (
    <FormShell
      writes="provider"
      {...shell}
      spec={providerSpec}
      submitLabel={shell.isNew ? tsave('provider') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('providerCreated') : tsave('providerSaved')}
    >
      <TextField
        name="name"
        label={t('name')}
        help={defaults.name ? t('nameHelp') : undefined}
        required
        defaultValue={defaults.name}
        placeholder={tp('providerName')}
      />
      <FieldRow>
        <TextField
          name="companyId"
          label={t('companyId')}
          help={t('companyIdHelp')}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={defaults.companyId ?? ''}
          placeholder={tp('companyId')}
        />
        <TextField
          name="phone"
          type="tel"
          label={t('phone')}
          autoComplete="off"
          defaultValue={defaults.phone ?? ''}
          placeholder={tp('phone')}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          name="email"
          type="email"
          label={t('email')}
          autoComplete="off"
          defaultValue={defaults.email ?? ''}
          placeholder={tp('email')}
        />
        <TextField
          name="website"
          inputMode="url"
          label={t('website')}
          help={t('websiteHelp')}
          autoComplete="off"
          defaultValue={defaults.website ?? ''}
          placeholder={tp('website')}
        />
      </FieldRow>
      <TextAreaField
        name="note"
        label={t('note')}
        defaultValue={defaults.note ?? undefined}
        placeholder={tp('note')}
      />
    </FormShell>
  )
}
