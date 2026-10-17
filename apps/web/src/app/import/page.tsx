import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ImportView } from '@/features/import/import-view'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('import'))('title') }
}

export default async function ImportPage() {
  await requireAdminPage()
  return <ImportView />
}
