import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PositionFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('newTitle') }
}

export default async function NewPositionPage() {
  await requireAdminPage()
  return <PositionFormView />
}
