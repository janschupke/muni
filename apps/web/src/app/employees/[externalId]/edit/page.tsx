import { getEmployeeForEdit, listDepartments, listPositions } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { EmployeeForm } from '@/components/form/entity-forms'
import { saveEmployee } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  const [employee, departments, positions, t] = await Promise.all([
    getEmployeeForEdit(externalId),
    listDepartments(),
    listPositions(),
    getTranslations('forms.employee'),
  ])
  if (!employee) notFound()
  return (
    <>
      <PageHeader
        title={t('title', { name: `${employee.firstName} ${employee.lastName}` })}
        eyebrow={
          <BackLink
            fallback={{
              href: `/employees/${externalId}`,
              label: `${employee.firstName} ${employee.lastName}`,
            }}
          />
        }
      />
      <EmployeeForm
        action={saveEmployee.bind(null, externalId)}
        cancelHref={`/employees/${externalId}`}
        defaults={employee}
        departments={departments}
        positions={positions}
      />
    </>
  )
}
