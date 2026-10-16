import { listCourses } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ComplianceLegend } from '@/components/compliance-breakdown'
import { CoursesTable } from '@/components/courses-table'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursesPage() {
  const [courses, t] = await Promise.all([listCourses(), getTranslations('courses')])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {courses.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <>
          <ComplianceLegend className="mb-3" />
          <CoursesTable courses={courses} />
        </>
      )}
    </>
  )
}
