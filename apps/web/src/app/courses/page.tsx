import { listCourses } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ComplianceLegend } from '@/components/compliance-breakdown'
import { CoursesTable } from '@/components/courses-table'
import { ListActions } from '@/components/list-actions'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursesPage() {
  const user = await requireReader()
  const [courses, t] = await Promise.all([listCourses(), getTranslations('courses')])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite(user.role) && (
            <ListActions kind="course" create={{ href: '/courses/new', label: t('new') }} />
          )
        }
      />
      {courses.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <>
          <ComplianceLegend className="mb-3" />
          <CoursesTable courses={courses} canEdit={canWrite(user.role)} />
        </>
      )}
    </>
  )
}
