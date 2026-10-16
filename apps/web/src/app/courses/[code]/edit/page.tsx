import { getCourseForEdit } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { CourseForm } from '@/components/form/entity-forms'
import { saveCourse } from '@/server/actions/edit'
import { requirePageUser } from '@/server/auth'

export default async function EditCoursePage({ params }: { params: Promise<{ code: string }> }) {
  await requirePageUser()
  const { code } = await params
  const [course, t] = await Promise.all([getCourseForEdit(code), getTranslations('forms.course')])
  if (!course) notFound()
  return (
    <>
      <PageHeader title={t('title', { code })} />
      <CourseForm
        action={saveCourse.bind(null, code)}
        cancelHref={`/courses/${code}`}
        defaults={course}
      />
    </>
  )
}
