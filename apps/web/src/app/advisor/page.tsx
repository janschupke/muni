import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AdvisorView } from '@/features/advisor/advisor-view'
import { ADVISOR_SORT, ADVISOR_VIEWS } from '@/lib/list-keys'
import { advisorInput } from '@/lib/read-inputs'
import { oneOf, param, parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('advisor'))('title') }
}

export default async function AdvisorPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  const params = await searchParams
  const view = oneOf(param(params, 'view'), ADVISOR_VIEWS) ?? 'breakdown'
  const bucket = param(params, 'bucket')
  return prefetched(
    user,
    [{ name: 'advisor', input: advisorInput(view, bucket, parseList(params, ADVISOR_SORT)) }],
    <AdvisorView view={view} bucket={bucket} canApply={canWrite(user.role)} />
  )
}
