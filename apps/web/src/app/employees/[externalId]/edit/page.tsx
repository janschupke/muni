import { displayName } from '@muni/domain/names'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeeFormView } from '@/features/employees/employee-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ externalId: string }>
}): Promise<Metadata> {
  const { externalId } = await params
  const t = await getTranslations()
  return titleOf(
    { name: 'employee-form', input: { externalId } },
    data => data.employee && t('forms.employee.title', { name: displayName(data.employee) }),
    t('employees.title')
  )
}

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
