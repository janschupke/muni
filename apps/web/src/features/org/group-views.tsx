'use client'

import { EMPLOYEE_SORT_KEYS } from '@muni/domain/enums'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { PLACEHOLDER } from '@muni/utils/format'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { PersonLink } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { DetailSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import { useListUrl } from '@/lib/use-list-url'
import type { ReadOutput } from '@/server/reads/registry'

import { GroupBreakdown } from './group-breakdown'
import { GroupFacts } from './group-facts'
import { GroupCourses, GroupPeople } from './group-sections'

const PLURAL = { department: 'departments', position: 'positions' } as const

/**
 * A department's or a position's page: its facts (a department's head and positions, a
 * position's departments), the courses it must hold, its people, and its upcoming bookings.
 */
export function GroupView({
  kind,
  id,
  canEdit,
}: {
  kind: 'department' | 'position'
  id: string
  canEdit: boolean
}) {
  const plural = PLURAL[kind]
  const t = useTranslations(plural)
  const people = useListUrl(EMPLOYEE_SORT_KEYS, undefined, 'people')
  const read = useQuery({
    ...readQuery(kind, { id, ...people.input }),
    placeholderData: keepPreviousData,
  })
  useDocumentTitle(read.data?.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity={plural}>
      {group => (
        <>
          <PageHeader
            eyebrow={<BackLink fallback={{ href: `/${plural}`, label: t('title') }} />}
            title={group.name}
            actions={
              canEdit && (
                <RecordActions
                  kind={kind}
                  id={group.id}
                  name={group.name}
                  editHref={`/${plural}/${group.id}/edit`}
                  then={`/${plural}`}
                />
              )
            }
          />
          <SplitLayout
            side={
              <Card>
                <CardHeader title={t('detail.facts')} />
                <CardBody className="flex flex-col gap-5">
                  <GroupFacts group={group} bookingsHref={`/${plural}/${group.id}/bookings`}>
                    <OwnFacts group={group} />
                  </GroupFacts>
                </CardBody>
              </Card>
            }
            main={<GroupCourses kind={plural} group={group} />}
          />
          <GroupPeople kind={plural} group={group} paging={people.paging} canBook={canEdit} />
        </>
      )}
    </ReadView>
  )
}

/** What only one kind has: a department's head and positions, a position's departments. */
function OwnFacts({ group }: { group: ReadOutput<'department'> | ReadOutput<'position'> }) {
  const td = useTranslations('departments.detail')
  const tp = useTranslations('positions.detail')
  if ('departments' in group)
    return (
      <DescriptionItem label={tp('departments')}>
        {group.departments.length === 0 ? (
          <EmptyState variant="inline" title={tp('noDepartments')} />
        ) : (
          <GroupBreakdown kind="departments" groups={group.departments} />
        )}
      </DescriptionItem>
    )
  return (
    <>
      <DescriptionItem label={td('head')}>
        {group.head ? <PersonLink person={group.head} /> : PLACEHOLDER}
      </DescriptionItem>
      <DescriptionItem label={td('positions')}>
        {group.positions.length === 0 ? (
          <EmptyState variant="inline" title={td('noPositions')} />
        ) : (
          <GroupBreakdown kind="positions" groups={group.positions} />
        )}
      </DescriptionItem>
    </>
  )
}
