import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

/** A new session of this course, from the course's page. */

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
