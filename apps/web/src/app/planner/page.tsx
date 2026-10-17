import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PlannerPageView } from '@/features/planner/planner-page-view'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('planner'))('title') }
}

export default async function PlannerPage() {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'planner', input: {} }],
    <PlannerPageView canCreate={canWrite(user.role)} />
  )
}
