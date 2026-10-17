import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeeFormView } from '@/features/employees/employee-form-view'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.employee'))('newTitle') }
}

export default async function NewEmployeePage() {
  await requireAdminPage()
  return <EmployeeFormView />
}
