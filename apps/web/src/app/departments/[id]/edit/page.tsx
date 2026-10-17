import { DepartmentFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

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
