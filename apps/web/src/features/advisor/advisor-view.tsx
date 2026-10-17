'use client'

import { FORECAST_MONTHS, NOW, unpackPlan } from '@muni/domain/advisor'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { ListSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import type { ReadOutput } from '@/server/reads/registry'

import { AdvisorWorkbench } from './advisor-workbench'
import type { AdvisorView as View } from './labels'

/** The plan arrives packed (each session once); the views take it whole. */
const unpacked = ({ plan, asOf }: ReadOutput<'advisor'>) => ({ plan: unpackPlan(plan), asOf })

/** The advisor: its plan, in the view and month the address asks for (`?view=`, `?bucket=`). */
export function AdvisorView({
  view,
  bucket,
  canApply,
}: {
  view: View
  bucket: string | undefined
  canApply: boolean
}) {
  const t = useTranslations('advisor')
  const read = useQuery({ ...readQuery('advisor', {}), select: unpacked })
  return (
    <>
      <PageHeader title={t('title')} description={t('description', { months: FORECAST_MONTHS })} />
      <ReadView query={read} skeleton={<ListSkeleton columns={6} />}>
        {({ plan, asOf }) => (
          <AdvisorWorkbench
            plan={plan}
            asOf={asOf}
            view={view}
            bucket={plan.breakdown.find(r => r.bucket === bucket)?.bucket ?? NOW}
            canApply={canApply}
          />
        )}
      </ReadView>
    </>
  )
}
