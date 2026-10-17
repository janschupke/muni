import { EmployeeFormView } from '@/features/employees/employee-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  const user = await requireAdminPage()
  const { externalId } = await params
  return prefetched(
    user,
    [{ name: 'employee-form', input: { externalId } }],
    <EmployeeFormView externalId={externalId} />,
    { form: true }
  )
}
