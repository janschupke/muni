'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveProvider } from '@/server/actions/providers'

import { ProviderForm } from './provider-form'

/** A provider to edit. (A new one needs nothing read: its page renders the empty form.) */
export function ProviderFormView({ id }: { id: string }) {
  const t = useTranslations('providers.form')
  const read = useFormRead('provider-form', { id })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={6} />} entity="providers">
      {provider => (
        <ProviderForm
          {...formShell({
            action: saveProvider.bind(null, id),
            back: { href: `/providers/${id}`, label: provider.name },
            title: t('editTitle', { name: provider.name }),
          })}
          defaults={provider}
        />
      )}
    </ReadView>
  )
}
