import { EMPLOYEE_SORT_KEYS } from '@muni/db/repositories'
import { canWrite, COMPLIANCE_STATUSES, EMPLOYMENT_STATES } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeesView } from '@/features/employees/employees-view'
import { employeesListInput } from '@/lib/read-inputs'
import { oneOf, param, parseSort, type SearchParams } from '@/lib/search-params'
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
  const sort = parseSort(params, EMPLOYEE_SORT_KEYS)
  const page = Number(param(params, 'page') ?? 1) || 1
  return prefetched(
    user,
    [{ name: 'employees-list', input: employeesListInput(filters, sort, page) }],
    <EmployeesView filters={filters} sort={sort} page={page} canEdit={canWrite(user.role)} />
  )
}
