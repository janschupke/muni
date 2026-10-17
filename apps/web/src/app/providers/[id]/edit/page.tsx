import { ProviderFormView } from '@/features/providers/provider-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(
    user,
    [{ name: 'provider-form', input: { id } }],
    <ProviderFormView id={id} />,
    { form: true }
  )
}
