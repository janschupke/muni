import { getAdvisorInput } from '@muni/db/repositories'
import { advisorSettingsSchema } from '@muni/domain/advisor'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AdvisorWorkbench } from '@/features/advisor/advisor-workbench'
import { param, type SearchParams } from '@/lib/search-params'
import { getViewer } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('advisor'))('title') }
}

export default async function AdvisorPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  // The calculator's settings live in the URL so a plan can be shared; anything odd is clamped.
  const settings = advisorSettingsSchema.parse(
    Object.fromEntries(Object.keys(params).map(key => [key, param(params, key)]))
  )
  const [input, viewer, t] = await Promise.all([
    getAdvisorInput(),
    getViewer(),
    getTranslations('advisor'),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <AdvisorWorkbench
        input={input}
        initialSettings={settings}
        canApply={viewer === 'authenticated'}
      />
    </>
  )
}
