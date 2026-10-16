import { getPosition } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { RecordActions } from '@/components/record-actions'
import { GroupBreakdown } from '@/features/org/group-breakdown'
import { GroupFacts } from '@/features/org/group-facts'
import { GroupCourses, GroupPeople } from '@/features/org/group-sections'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

const loadPosition = cache(async (id: string) => {
  await requireReader()
  return getPosition(id)
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadPosition(id))?.name ?? id }
}

export default async function PositionPage({ params }: Props) {
  const { id } = await params
  const [position, t, user] = await Promise.all([
    loadPosition(id),
    getTranslations('positions'),
    requireReader(),
  ])
  if (!position) notFound()
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/positions', label: t('title') }} />}
        title={position.name}
        actions={
          canWrite(user.role) && (
            <RecordActions
              kind="position"
              id={position.id}
              name={position.name}
              editHref={`/positions/${position.id}/edit`}
              then="/positions"
            />
          )
        }
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody className="flex flex-col gap-5">
              <GroupFacts group={position} />
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">
                  {t('detail.departments')}
                </p>
                {position.departments.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t('detail.noDepartments')}</p>
                ) : (
                  <GroupBreakdown kind="departments" groups={position.departments} />
                )}
              </div>
            </CardBody>
          </Card>
        }
        main={<GroupCourses kind="positions" group={position} />}
      />
      <GroupPeople kind="positions" group={position} />
    </>
  )
}
