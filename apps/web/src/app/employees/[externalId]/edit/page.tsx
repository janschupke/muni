import {
  getEmployeeForEdit,
  listDepartmentHeads,
  listDepartmentPositions,
  listEmployeeOptions,
  listGroupOptions,
} from '@muni/db/repositories'
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
  const [employee, departments, positions, pairs, heads, people, t] = await Promise.all([
    getEmployeeForEdit(externalId),
    listGroupOptions('department'),
    listGroupOptions('position'),
    listDepartmentPositions(),
    listDepartmentHeads(),
    listEmployeeOptions(),
    getTranslations('forms.employee'),
  ])
  if (!employee) notFound()
  // Anyone else may manage them; their current manager stays offered even after leaving.
  const managers = people.filter(p => p.id !== employee.id)
  if (employee.manager && !managers.some(m => m.id === employee.manager?.id))
    managers.push({ ...employee.manager, externalId: '', departmentId: null })
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
      positionsByDepartment={pairs}
      heads={heads}
      managers={managers}
    />
  )
}
