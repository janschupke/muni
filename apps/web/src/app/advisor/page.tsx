import { getAdvisorInput } from '@muni/db/repositories'
import { FORECAST_MONTHS, NOW, planAssignments } from '@muni/domain/advisor'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AdvisorWorkbench } from '@/features/advisor/advisor-workbench'
import { ADVISOR_VIEWS } from '@/features/advisor/labels'
import { oneOf, param, type SearchParams } from '@/lib/search-params'
import { getViewer } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('advisor'))('title') }
}

export default async function AdvisorPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const [input, viewer, t] = await Promise.all([
    getAdvisorInput(),
    getViewer(),
    getTranslations('advisor'),
  ])
  // One fixed rule and the current data: the same plan for every visitor, so it is computed here.
  const plan = planAssignments(input)
  const view = oneOf(param(params, 'view'), ADVISOR_VIEWS) ?? 'breakdown'
  const bucket =
    oneOf(
      param(params, 'bucket'),
      plan.breakdown.map(r => r.bucket)
    ) ?? NOW
  return (
    <>
      <PageHeader title={t('title')} description={t('description', { months: FORECAST_MONTHS })} />
      <AdvisorWorkbench
        plan={plan}
        asOf={input.asOf}
        view={view}
        bucket={bucket}
        canApply={viewer === 'authenticated'}
      />
    </>
  )
}
