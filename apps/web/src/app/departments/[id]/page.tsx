import { getDepartment, listEmployees } from '@muni/db/repositories'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { EmployeesTable } from '@/components/employees-table'
import { CourseComplianceTable } from '@/features/org/course-compliance-table'
import { GroupBreakdown } from '@/features/org/group-breakdown'
import { GroupFacts } from '@/features/org/group-facts'

type Props = { params: Promise<{ id: string }> }

const loadDepartment = cache((id: string) => getDepartment(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadDepartment(id))?.name ?? id }
}

export default async function DepartmentPage({ params }: Props) {
  const { id } = await params
  const [department, people, t] = await Promise.all([
    loadDepartment(id),
    listEmployees({ departmentId: id, pageSize: 100 }),
    getTranslations('departments'),
  ])
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
              <GroupFacts
                group={department}
                labels={{ active: t('detail.active'), onLeave: t('detail.onLeave') }}
              >
                <DescriptionItem label={t('detail.head')}>
                  {department.head ? (
                    <TextLink asChild>
                      <Link href={`/employees/${department.head.externalId}`}>
                        {department.head.name}
                      </Link>
                    </TextLink>
                  ) : (
                    PLACEHOLDER
                  )}
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
        main={
          <>
            <SectionHeading className="mt-0">{t('detail.courses')}</SectionHeading>
            <p className="-mt-2 mb-3 text-sm text-fg-muted">{t('detail.coursesDescription')}</p>
            {department.courses.length === 0 ? (
              <EmptyState variant="inline" title={t('detail.noCourses')} />
            ) : (
              <CourseComplianceTable courses={department.courses} />
            )}
            <SectionHeading>{t('detail.people')}</SectionHeading>
            <EmployeesTable items={people.items} />
            <p className="mt-3 text-sm">
              <TextLink asChild>
                <Link
                  href={`/employees?department=${encodeURIComponent(department.name)}`}
                  className="inline-flex items-center gap-1"
                >
                  {t('detail.inList')}
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </TextLink>
            </p>
          </>
        }
      />
    </>
  )
}
