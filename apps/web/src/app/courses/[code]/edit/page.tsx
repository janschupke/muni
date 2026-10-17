import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { CourseFormView } from '@/features/courses/course-form-view'
import { requireAdminPage } from '@/server/auth'

export default async function EditCoursePage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage()
  const { code } = await params
  if (!(await recordExists('course', code))) notFound()
  return <CourseFormView code={code} />
}
