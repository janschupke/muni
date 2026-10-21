'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/views/read-view'
import { FormSkeleton, PageLoading } from '@/components/views/skeletons'
import { ProviderForm } from '@/features/providers/provider-form'
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

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <FormSkeleton fields={8} />

/** A new provider (no `id`), or one to edit, with the courses it can offer. */
export function ProviderFormView({ id }: { id?: string | undefined }) {
  const t = useTranslations()
  const read = useFormRead('provider-form', { id })
  return (
    <ReadView query={read} skeleton={SKELETON} entity="providers">
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

/** The page until its data is there (its route's `loading.tsx`). */
export function ProviderFormLoading() {
  return <PageLoading>{SKELETON}</PageLoading>
}
