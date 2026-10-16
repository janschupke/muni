import { getPosition, listEmployees } from '@muni/db/repositories'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { EmployeesTable } from '@/components/employees-table'
import { CourseComplianceTable } from '@/features/org/course-compliance-table'
import { GroupBreakdown } from '@/features/org/group-breakdown'
import { GroupFacts } from '@/features/org/group-facts'

type Props = { params: Promise<{ id: string }> }

const loadPosition = cache((id: string) => getPosition(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadPosition(id))?.name ?? id }
}

export default async function PositionPage({ params }: Props) {
  const { id } = await params
  const [position, people, t] = await Promise.all([
    loadPosition(id),
    listEmployees({ positionId: id, pageSize: 100 }),
    getTranslations('positions'),
  ])
  if (!position) notFound()
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/positions', label: t('title') }} />}
        title={position.name}
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody className="flex flex-col gap-5">
              <GroupFacts
                group={position}
                labels={{ active: t('detail.active'), onLeave: t('detail.onLeave') }}
              />
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
        main={
          <>
            <SectionHeading className="mt-0">{t('detail.courses')}</SectionHeading>
            <p className="-mt-2 mb-3 text-sm text-fg-muted">{t('detail.coursesDescription')}</p>
            {position.courses.length === 0 ? (
              <EmptyState variant="inline" title={t('detail.noCourses')} />
            ) : (
              <CourseComplianceTable courses={position.courses} />
            )}
            <SectionHeading>{t('detail.people')}</SectionHeading>
            <EmployeesTable items={people.items} />
          </>
        }
      />
    </>
  )
}
