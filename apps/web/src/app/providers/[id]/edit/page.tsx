import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { ProviderFormView } from '@/features/providers/provider-form-view'
import { requireAdminPage } from '@/server/auth'

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  if (!(await recordExists('provider', id))) notFound()
  return <ProviderFormView id={id} />
}
