import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { CompletionFormView } from '@/features/employees/completion-form-view'
import { requireAdminPage } from '@/server/auth'

export default async function EditCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string; id: string }>
}) {
  await requireAdminPage()
  const { externalId, id } = await params
  // The completion's own person is checked by the read: someone else's is not found there.
  if (!(await recordExists('completion', id))) notFound()
  return <CompletionFormView externalId={externalId} id={id} />
}
