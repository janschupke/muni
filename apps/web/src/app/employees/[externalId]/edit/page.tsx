import { getEmployeeForEdit, listEmployeeOptions, listGroupOptions } from '@muni/db/repositories'
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
  const [employee, departments, positions, people, t] = await Promise.all([
    getEmployeeForEdit(externalId),
    listGroupOptions('department'),
    listGroupOptions('position'),
    listEmployeeOptions(),
    getTranslations('forms.employee'),
  ])
  if (!employee) notFound()
  const name = `${employee.firstName} ${employee.lastName}`
  return (
    <EmployeeForm
      action={saveEmployee.bind(null, externalId)}
      cancelHref={`/employees/${externalId}`}
      heading={{
        title: t('title', { name }),
        eyebrow: <BackLink fallback={{ href: `/employees/${externalId}`, label: name }} />,
      }}
      defaults={employee}
      departments={departments}
      positions={positions}
      managers={people.filter(p => p.externalId !== externalId)}
    />
  )
}
