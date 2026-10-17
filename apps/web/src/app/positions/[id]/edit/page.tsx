import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PositionFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const t = await getTranslations('positions')
  return titleOf(
    { name: 'position-form', input: { id } },
    data => data.position && t('editTitle', { name: data.position.name }),
    t('title')
  )
}

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(
    user,
    [{ name: 'position-form', input: { id } }],
    <PositionFormView id={id} />,
    { form: true }
  )
}
