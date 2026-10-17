'use client'

import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ComplianceLegend } from '@/components/compliance-breakdown'
import { CoursesTable } from '@/components/courses-table'
import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { COURSE_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { useListUrl } from '@/lib/use-list-url'

/** The course catalogue, a page at a time, sorted on the server. */
export function CoursesView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('courses')
  const list = useListUrl(COURSE_SORT)
  const read = useQuery({
    ...readQuery('courses-list', list.input),
    placeholderData: keepPreviousData,
  })
  const create = canEdit && { href: '/courses/new', label: t('new') }
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={create && <ListActions kind="course" create={create} />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {courses =>
          courses.total === 0 ? (
            <ListEmpty title={t('empty')} create={create} />
          ) : (
            <>
              <ComplianceLegend className="mb-3" />
              <CoursesTable
                courses={courses.items}
                paging={list.paging(courses)}
                canEdit={canEdit}
              />
            </>
          )
        }
      </ReadView>
    </>
  )
}
