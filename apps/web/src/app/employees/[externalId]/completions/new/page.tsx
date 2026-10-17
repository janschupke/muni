import { CompletionFormView } from '@/features/employees/completion-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export default async function NewCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  const user = await requireAdminPage()
  const { externalId } = await params
  return prefetched(
    user,
    [{ name: 'completion-form', input: { externalId } }],
    <CompletionFormView externalId={externalId} />,
    { form: true }
  )
}
