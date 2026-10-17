'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem } from '@muni/ui/description-list'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { PLACEHOLDER } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { PersonLink } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { DetailSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'

import { GroupBreakdown } from './group-breakdown'
import { GroupFacts } from './group-facts'
import { GroupCourses, GroupPeople } from './group-sections'

/** A department's page: who leads it, its positions, the courses it must hold, its people. */
export function DepartmentView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const t = useTranslations('departments')
  const read = useQuery(readQuery('department', { id }))
  useDocumentTitle(read.data?.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="departments">
      {department => (
        <>
          <PageHeader
            eyebrow={<BackLink fallback={{ href: '/departments', label: t('title') }} />}
            title={department.name}
            actions={
              canEdit && (
                <RecordActions
                  kind="department"
                  id={department.id}
                  name={department.name}
                  editHref={`/departments/${department.id}/edit`}
                  then="/departments"
                />
              )
            }
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
                    <p className="mb-1.5 text-xs font-medium text-fg-muted">
                      {t('detail.positions')}
                    </p>
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
      )}
    </ReadView>
  )
}

/** A position's page: the departments it is in, the courses it must hold, its people. */
export function PositionView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const t = useTranslations('positions')
  const read = useQuery(readQuery('position', { id }))
  useDocumentTitle(read.data?.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="positions">
      {position => (
        <>
          <PageHeader
            eyebrow={<BackLink fallback={{ href: '/positions', label: t('title') }} />}
            title={position.name}
            actions={
              canEdit && (
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
      )}
    </ReadView>
  )
}
