import { recordExists } from '@muni/db/repositories'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** A new session of this course, from the course's page. */

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const t = await getTranslations()
  return titleOf(
    { name: 'session-form', input: {} },
    data => {
      const course = data.courses.find(c => c.code === code)
      return course && t('courses.newTitle', { course: course.name })
    },
    t('sessions.newTitle')
  )
}

export default async function NewSessionPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireAdminPage()
  const { code } = await params
  if (!(await recordExists('course', code))) notFound()
  return prefetched(
    user,
    [{ name: 'session-form', input: {} }],
    <SessionFormView courseCode={code} />,
    { form: true }
  )
}
