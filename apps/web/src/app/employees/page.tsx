import {
  canWrite,
  COMPLIANCE_STATUSES,
  EMPLOYEE_SORT_KEYS,
  EMPLOYMENT_STATES,
} from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeesView } from '@/features/employees/employees-view'
import { employeesListInput } from '@/lib/read-inputs'
import { oneOf, param, parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('employees'))('title') }
}

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  const params = await searchParams
  const filters = {
    q: param(params, 'q'),
    department: param(params, 'department'),
    position: param(params, 'position'),
    status: oneOf(param(params, 'status'), EMPLOYMENT_STATES),
    compliance: oneOf(param(params, 'compliance'), COMPLIANCE_STATUSES),
    manager: param(params, 'manager'),
  }
  return prefetched(
    user,
    [
      {
        name: 'employees-list',
        input: employeesListInput(filters, parseList(params, EMPLOYEE_SORT_KEYS)),
      },
    ],
    <EmployeesView filters={filters} canEdit={canWrite(user.role)} />
  )
}
