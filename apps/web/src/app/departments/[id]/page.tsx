import { getDepartment } from '@muni/db/repositories'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem } from '@muni/ui/description-list'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { PLACEHOLDER } from '@muni/utils/format'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { PersonLink } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { GroupBreakdown } from '@/features/org/group-breakdown'
import { GroupFacts } from '@/features/org/group-facts'
import { GroupCourses, GroupPeople } from '@/features/org/group-sections'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

const loadDepartment = cache(async (id: string) => {
  await requireReader()
  return getDepartment(id)
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadDepartment(id))?.name ?? id }
}

export default async function DepartmentPage({ params }: Props) {
  const { id } = await params
  const [department, t] = await Promise.all([loadDepartment(id), getTranslations('departments')])
  if (!department) notFound()
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/departments', label: t('title') }} />}
        title={department.name}
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody className="flex flex-col gap-5">
              <GroupFacts group={department}>
                <DescriptionItem label={t('detail.head')}>
                  {department.head ? <PersonLink person={department.head} /> : PLACEHOLDER}
                </DescriptionItem>
              </GroupFacts>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">{t('detail.positions')}</p>
                {department.positions.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t('detail.noPositions')}</p>
                ) : (
                  <GroupBreakdown kind="positions" groups={department.positions} />
                )}
              </div>
            </CardBody>
          </Card>
        }
        main={<GroupCourses kind="departments" group={department} />}
      />
      <GroupPeople kind="departments" group={department} />
    </>
  )
}
