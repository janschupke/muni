import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { CompletionFormView } from '@/features/employees/completion-form-view'
import { requireAdminPage } from '@/server/auth'

export default async function NewCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  if (!(await recordExists('employee', externalId))) notFound()
  return <CompletionFormView externalId={externalId} />
}
