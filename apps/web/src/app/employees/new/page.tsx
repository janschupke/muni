import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeeFormView } from '@/features/employees/employee-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.employee'))('newTitle') }
}

export default async function NewEmployeePage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'employee-form', input: {} }], <EmployeeFormView />, {
    form: true,
  })
}
