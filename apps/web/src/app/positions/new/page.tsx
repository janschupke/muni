import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PositionFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('newTitle') }
}

export default async function NewPositionPage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'position-form', input: {} }], <PositionFormView />, {
    form: true,
  })
}
