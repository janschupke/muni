'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveProvider } from '@/server/actions/providers'

import { ProviderForm } from './provider-form'

/** A provider to edit. (A new one needs nothing read: its page renders the empty form.) */
export function ProviderFormView({ id }: { id: string }) {
  const t = useTranslations('providers.form')
  const read = useQuery({ ...readQuery('provider-form', { id }), ...FORM_READ })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={6} />} entity="providers">
      {provider => (
        <ProviderForm
          action={saveProvider.bind(null, id)}
          cancelHref={`/providers/${id}`}
          heading={{
            title: t('editTitle', { name: provider.name }),
            eyebrow: <BackLink fallback={{ href: `/providers/${id}`, label: provider.name }} />,
          }}
          defaults={provider}
        />
      )}
    </ReadView>
  )
}
