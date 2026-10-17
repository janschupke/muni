import {
  listDepartmentHeads,
  listDepartmentPositions,
  listEmployeeOptions,
  listGroupOptions,
} from '@muni/db/repositories'
import { todayIn } from '@muni/utils/dates'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { EmployeeForm } from '@/components/form/entity-forms'
import { saveEmployee } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.employee'))('newTitle') }
}

export default async function NewEmployeePage() {
  await requireAdminPage()
  const [departments, positions, pairs, heads, people, t] = await Promise.all([
    listGroupOptions('department'),
    listGroupOptions('position'),
    listDepartmentPositions(),
    listDepartmentHeads(),
    listEmployeeOptions(),
    getTranslations(),
  ])
  return (
    <EmployeeForm
      action={saveEmployee.bind(null, null)}
      cancelHref="/employees"
      heading={{
        title: t('forms.employee.newTitle'),
        eyebrow: <BackLink fallback={{ href: '/employees', label: t('employees.title') }} />,
        description: t('forms.employee.newHelp'),
      }}
      defaults={{
        firstName: '',
        lastName: '',
        email: null,
        nationalId: null,
        departmentId: null,
        positionId: null,
        managerId: null,
        leadsDepartment: false,
        hiredOn: todayIn(),
        leftOn: null,
        status: 'ACTIVE',
        note: null,
      }}
      departments={departments}
      positions={positions}
      positionsByDepartment={pairs}
      heads={heads}
      managers={people}
    />
  )
}
