import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'

/** A new session of this course, from the course's page. */
export default async function NewSessionPage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage()
  const { code } = await params
  if (!(await recordExists('course', code))) notFound()
  return <SessionFormView courseCode={code} />
}
