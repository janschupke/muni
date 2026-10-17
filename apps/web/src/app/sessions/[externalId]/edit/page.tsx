import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

/** Named attendees are added and removed on the session's page; the form edits the rest. */

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  const user = await requireAdminPage()
  const { externalId } = await params
  return prefetched(
    user,
    [{ name: 'session-form', input: { externalId } }],
    <SessionFormView externalId={externalId} />,
    { form: true }
  )
}
