import { getAdvisorInput, getPlannerInput } from '@muni/db/repositories'
import { planAssignments } from '@muni/domain/advisor'
import { planSessions } from '@muni/domain/planner'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PlannerView, type PlannerGroup } from '@/features/planner/planner-view'
import { getViewer } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('planner'))('title') }
}

export default async function PlannerPage() {
  const [advisor, planner, viewer, t] = await Promise.all([
    getAdvisorInput(),
    getPlannerInput(),
    getViewer(),
    getTranslations('planner'),
  ])
  const offers = planSessions({
    asOf: advisor.asOf,
    items: planAssignments(advisor).items,
    ...planner,
  })
  // One section per course, in the order of its most urgent offer.
  const groups: PlannerGroup[] = []
  for (const offer of offers) {
    let group = groups.find(g => g.course.code === offer.course.code)
    if (!group) {
      const course = planner.courses.find(c => c.code === offer.course.code)
      if (!course) continue
      group = {
        course: {
          code: course.code,
          name: course.name,
          sessionMinutes: course.sessionMinutes,
          groupSize: course.groupSize,
          onlineAllowed: course.onlineAllowed,
          capabilities: [...course.capabilities],
        },
        offers: [],
      }
      groups.push(group)
    }
    group.offers.push(offer)
  }
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {groups.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <PlannerView groups={groups} canCreate={viewer === 'authenticated'} />
      )}
      <p className="mt-8 max-w-3xl text-xs text-fg-muted">{t('rule')}</p>
    </>
  )
}
