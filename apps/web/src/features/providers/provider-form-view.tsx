'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ProviderForm } from '@/components/form/provider-form'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveProvider } from '@/server/actions/providers'

const EMPTY = {
  name: '',
  companyId: null,
  email: null,
  phone: null,
  website: null,
  note: null,
  isDefault: false,
  offerings: [],
}

/** A new provider (no `id`), or one to edit, with the courses it can offer. */
export function ProviderFormView({ id }: { id?: string | undefined }) {
  const t = useTranslations()
  const read = useFormRead('provider-form', { id })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={8} />} entity="providers">
      {({ provider, courses }) =>
        provider && id ? (
          <ProviderForm
            {...formShell({
              action: saveProvider.bind(null, id),
              back: { href: `/providers/${id}`, label: provider.name },
              title: t('forms.provider.editTitle', { name: provider.name }),
            })}
            defaults={provider}
            courses={courses}
          />
        ) : (
          <ProviderForm
            {...formShell({
              action: saveProvider.bind(null, null),
              back: { href: '/providers', label: t('providers.title') },
              title: t('forms.provider.newTitle'),
              isNew: true,
            })}
            defaults={EMPTY}
            courses={courses}
          />
        )
      }
    </ReadView>
  )
}
