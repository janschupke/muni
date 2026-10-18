import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CourseFormView } from '@/features/courses/course-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const t = await getTranslations()
  return titleOf(
    { name: 'course-form', input: { code } },
    data => data.course && t('forms.course.editTitle', { name: data.course.name }),
    t('courses.title')
  )
}

export default async function EditCoursePage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireAdminPage()
  const { code } = await params
  return prefetched(
    user,
    [{ name: 'course-form', input: { code } }],
    <CourseFormView code={code} />,
    { form: true }
  )
}
