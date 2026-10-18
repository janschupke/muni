import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ProviderFormView } from '@/features/providers/provider-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const t = await getTranslations('forms.provider')
  return titleOf(
    { name: 'provider-form', input: { id } },
    data => data.provider && t('editTitle', { name: data.provider.name }),
    (await getTranslations('providers'))('title')
  )
}

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(
    user,
    [{ name: 'provider-form', input: { id } }],
    <ProviderFormView id={id} />,
    { form: true }
  )
}
