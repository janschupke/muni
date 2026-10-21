'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { PageLoading, TableSkeleton } from '@/components/views/skeletons'
import { ComplianceLegend } from '@/features/compliance/compliance-breakdown'
import { CoursesTable } from '@/features/courses/courses-table'
import { COURSE_SORT } from '@/lib/list/list-keys'
import { useListUrl } from '@/lib/list/use-list-url'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <TableSkeleton columns={5} />

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
      skeleton={SKELETON}
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

/** The page until its data is there (its route's `loading.tsx`): its heading, then the rows. */
export function CoursesLoading() {
  const t = useTranslations('courses')
  return (
    <PageLoading title={t('title')} description={t('description')}>
      {SKELETON}
    </PageLoading>
  )
}
