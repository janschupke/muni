import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CompletionFormView } from '@/features/employees/completion-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ externalId: string; id: string }>
}): Promise<Metadata> {
  const { externalId, id } = await params
  const t = await getTranslations('forms.completion')
  return titleOf(
    { name: 'completion-form', input: { externalId, id } },
    data =>
      data.completion &&
      t('editTitle', { id: data.completion.externalId, name: data.completion.employee.name }),
    (await getTranslations('employees'))('title')
  )
}

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
