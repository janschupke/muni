import { getCourseForEdit } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { CourseForm } from '@/components/form/entity-forms'
import { saveCourse } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export default async function EditCoursePage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage()
  const { code } = await params
  const [course, t] = await Promise.all([getCourseForEdit(code), getTranslations('forms.course')])
  if (!course) notFound()
  return (
    <>
      <PageHeader
        title={t('title', { code })}
        eyebrow={<BackLink fallback={{ href: `/courses/${code}`, label: course.name }} />}
      />
      <CourseForm
        action={saveCourse.bind(null, code)}
        cancelHref={`/courses/${code}`}
        defaults={course}
      />
    </>
  )
}
