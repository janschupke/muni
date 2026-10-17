import { CourseFormView } from '@/features/courses/course-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

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
