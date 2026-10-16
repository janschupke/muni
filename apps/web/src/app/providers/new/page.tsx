import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { ProviderForm } from '@/features/providers/provider-form'
import { saveProvider } from '@/server/actions/providers'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('providers.form'))('newTitle') }
}

export default async function NewProviderPage() {
  await requireAdminPage()
  const t = await getTranslations('providers')
  return (
    <ProviderForm
      action={saveProvider.bind(null, null)}
      cancelHref="/providers"
      heading={{
        title: t('form.newTitle'),
        eyebrow: <BackLink fallback={{ href: '/providers', label: t('title') }} />,
      }}
      defaults={{
        name: '',
        companyId: null,
        email: null,
        phone: null,
        website: null,
        note: null,
      }}
    />
  )
}
