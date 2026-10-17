import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { DepartmentFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  if (!(await recordExists('department', id))) notFound()
  return <DepartmentFormView id={id} />
}
