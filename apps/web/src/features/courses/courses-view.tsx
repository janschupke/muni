'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ComplianceLegend } from '@/components/compliance-breakdown'
import { CoursesTable } from '@/components/courses-table'
import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

/** The course catalogue. */
export function CoursesView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('courses')
  const read = useQuery(readQuery('courses-list', {}))
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canEdit && (
            <ListActions kind="course" create={{ href: '/courses/new', label: t('new') }} />
          )
        }
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {courses =>
          courses.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <>
              <ComplianceLegend className="mb-3" />
              <CoursesTable courses={courses} canEdit={canEdit} />
            </>
          )
        }
      </ReadView>
    </>
  )
}
