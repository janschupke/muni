import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ProviderFormView } from '@/features/providers/provider-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.provider'))('newTitle') }
}

export default async function NewProviderPage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'provider-form', input: {} }], <ProviderFormView />, {
    form: true,
  })
}
