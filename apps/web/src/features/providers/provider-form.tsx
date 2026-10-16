'use client'

import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'

import { type FormHeading, FormShell, TextAreaField, TextField } from '@/components/form/form-shell'
import type { FormState } from '@/lib/form'

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
}) {
  const t = useTranslations('providers.form')
  return (
    <FormShell {...shell}>
      <TextField
        name="name"
        label={t('name')}
        help={defaults.name ? t('nameHelp') : undefined}
        required
        defaultValue={defaults.name}
      />
      <FieldRow>
        <TextField
          name="companyId"
          label={t('companyId')}
          help={t('companyIdHelp')}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={defaults.companyId ?? ''}
        />
        <TextField
          name="phone"
          type="tel"
          label={t('phone')}
          autoComplete="off"
          defaultValue={defaults.phone ?? ''}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          name="email"
          type="email"
          label={t('email')}
          autoComplete="off"
          defaultValue={defaults.email ?? ''}
        />
        <TextField
          name="website"
          inputMode="url"
          label={t('website')}
          help={t('websiteHelp')}
          autoComplete="off"
          defaultValue={defaults.website ?? ''}
        />
      </FieldRow>
      <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? undefined} />
    </FormShell>
  )
}
