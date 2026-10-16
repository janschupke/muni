import { getDb } from '@muni/db/client'
import { loadReferenceSnapshot } from '@muni/db/reference'
import { PageHeader } from '@muni/ui/page-header'
import { todayIn } from '@muni/utils/dates'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ImportWizard } from '@/features/import/import-wizard'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('import'))('title') }
}

export default async function ImportPage() {
  await requireAdminPage()
  const [reference, t] = await Promise.all([
    loadReferenceSnapshot(getDb()),
    getTranslations('import'),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ImportWizard reference={reference} today={todayIn()} />
    </>
  )
}
