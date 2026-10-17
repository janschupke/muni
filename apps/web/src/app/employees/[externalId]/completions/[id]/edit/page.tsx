import { CompletionFormView } from '@/features/employees/completion-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export default async function EditCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string; id: string }>
}) {
  const user = await requireAdminPage()
  const { externalId, id } = await params
  // The read finds the completion only among this person's: someone else's is a 404.
  return prefetched(
    user,
    [{ name: 'completion-form', input: { externalId, id } }],
    <CompletionFormView externalId={externalId} id={id} />,
    { form: true }
  )
}
