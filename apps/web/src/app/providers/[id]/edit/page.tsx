import { getProviderForEdit } from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { ProviderForm } from '@/features/providers/provider-form'
import { saveProvider } from '@/server/actions/providers'
import { requireAdminPage } from '@/server/auth'

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const [provider, t] = await Promise.all([
    getProviderForEdit(id),
    getTranslations('providers.form'),
  ])
  if (!provider) notFound()
  return (
    <ProviderForm
      action={saveProvider.bind(null, id)}
      cancelHref={`/providers/${id}`}
      heading={{
        title: t('editTitle', { name: provider.name }),
        eyebrow: <BackLink fallback={{ href: `/providers/${id}`, label: provider.name }} />,
      }}
      defaults={provider}
    />
  )
}
