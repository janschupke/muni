import { getProviderForEdit } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { ProviderForm } from '@/features/providers/provider-form'
import { removeProvider, saveProvider } from '@/server/actions/providers'
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
    <>
      <PageHeader
        title={t('editTitle', { name: provider.name })}
        eyebrow={<BackLink fallback={{ href: `/providers/${id}`, label: provider.name }} />}
      />
      <ProviderForm
        action={saveProvider.bind(null, id)}
        cancelHref={`/providers/${id}`}
        defaults={provider}
      />
      <hr className="my-8 max-w-2xl border-border-muted" />
      <ConfirmDeleteButton
        name={provider.name}
        messages="providers.form"
        action={removeProvider.bind(null, id)}
      />
    </>
  )
}
