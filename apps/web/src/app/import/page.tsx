import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ImportView } from '@/features/import/import-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('import'))('title') }
}

export default async function ImportPage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'import-reference', input: {} }], <ImportView />)
}
