import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'

/** Named attendees are added and removed on the session's page; the form edits the rest. */
export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  if (!(await recordExists('session', externalId))) notFound()
  return <SessionFormView externalId={externalId} />
}
