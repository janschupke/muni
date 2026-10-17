import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CompletionFormView } from '@/features/employees/completion-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ externalId: string }>
}): Promise<Metadata> {
  const { externalId } = await params
  const t = await getTranslations('forms.completion')
  return titleOf(
    { name: 'completion-form', input: { externalId } },
    data => t('title', { name: data.person.name }),
    (await getTranslations('employees'))('title')
  )
}

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
