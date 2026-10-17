'use client'

import { useTranslations } from 'next-intl'

import { ComplianceLegend } from '@/components/compliance-breakdown'
import { CoursesTable } from '@/components/courses-table'
import { ListView, useListRead } from '@/components/list-view'
import { TableSkeleton } from '@/components/skeletons'
import { COURSE_SORT } from '@/lib/list-keys'
import { useListUrl } from '@/lib/use-list-url'

/** The course catalogue, a page at a time, sorted on the server. */
export function CoursesView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('courses')
  const list = useListUrl(COURSE_SORT)
  return (
    <ListView
      kind="course"
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      canEdit={canEdit}
      create={{ href: '/courses/new', label: t('new') }}
      read={useListRead('courses-list', list.input)}
      skeleton={<TableSkeleton columns={5} />}
      totalOf={courses => courses.total}
    >
      {courses => (
        <>
          <ComplianceLegend className="mb-3" />
          <CoursesTable courses={courses.items} paging={list.paging(courses)} canEdit={canEdit} />
        </>
      )}
    </ListView>
  )
}
