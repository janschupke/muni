import { PositionFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

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
