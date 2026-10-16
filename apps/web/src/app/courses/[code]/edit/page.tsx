import { getCourseForEdit, listGroupOptions } from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { CourseForm } from '@/components/form/entity-forms'
import { saveCourse } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export default async function EditCoursePage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage()
  const { code } = await params
  const [course, departments, positions, t] = await Promise.all([
    getCourseForEdit(code),
    listGroupOptions('department'),
    listGroupOptions('position'),
    getTranslations('forms.course'),
  ])
  if (!course) notFound()
  return (
    <CourseForm
      action={saveCourse.bind(null, code)}
      cancelHref={`/courses/${code}`}
      heading={{
        title: t('title', { code }),
        eyebrow: <BackLink fallback={{ href: `/courses/${code}`, label: course.name }} />,
      }}
      defaults={course}
      departments={departments}
      positions={positions}
    />
  )
}
