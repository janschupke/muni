import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { DepartmentFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const t = await getTranslations('departments')
  return titleOf(
    { name: 'department-form', input: { id } },
    data => t('editTitle', { name: data.name }),
    t('title')
  )
}

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(
    user,
    [{ name: 'department-form', input: { id } }],
    <DepartmentFormView id={id} />,
    { form: true }
  )
}
