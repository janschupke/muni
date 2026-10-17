import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CourseFormView } from '@/features/courses/course-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.course'))('newTitle') }
}

export default async function NewCoursePage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'course-form', input: {} }], <CourseFormView />, { form: true })
}
