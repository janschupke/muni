import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AdvisorView } from '@/features/advisor/advisor-view'
import { ADVISOR_VIEWS } from '@/features/advisor/labels'
import { oneOf, param, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('advisor'))('title') }
}

export default async function AdvisorPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  const params = await searchParams
  return prefetched(
    user,
    [{ name: 'advisor', input: {} }],
    <AdvisorView
      view={oneOf(param(params, 'view'), ADVISOR_VIEWS) ?? 'breakdown'}
      bucket={param(params, 'bucket')}
      canApply={canWrite(user.role)}
    />
  )
}
