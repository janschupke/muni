import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { EmployeeFormView } from '@/features/employees/employee-form-view'
import { requireAdminPage } from '@/server/auth'

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  if (!(await recordExists('employee', externalId))) notFound()
  return <EmployeeFormView externalId={externalId} />
}
