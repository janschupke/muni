import {
  EMPLOYEE_SORT_KEYS,
  getPersonName,
  listDepartments,
  listEmployees,
  listPositions,
} from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { COMPLIANCE_STATUSES, EMPLOYMENT_STATUSES } from '@muni/domain/enums'
import { Alert } from '@muni/ui/alert'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Pagination } from '@muni/ui/pagination'
import { TextLink } from '@muni/ui/text-link'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { EmployeeFilters } from '@/components/employee-filters'
import { EmployeesTable } from '@/components/employees-table'
import { ListActions } from '@/components/list-actions'
import { oneOf, param, parseSort, type SearchParams, withParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'

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
    status: oneOf(param(params, 'status'), EMPLOYMENT_STATUSES),
    compliance: oneOf(param(params, 'compliance'), COMPLIANCE_STATUSES),
    manager: param(params, 'manager'),
  }
  const sort = parseSort(params, EMPLOYEE_SORT_KEYS)
  // Everything that shapes the list; page links and filter changes carry it along.
  const query = {
    ...filters,
    sort: sort?.by,
    dir: sort?.desc ? 'desc' : undefined,
  }
  const page = Number(param(params, 'page') ?? 1) || 1
  const [result, departments, positions, managerName, t, tc] = await Promise.all([
    listEmployees({ ...filters, sort, page }),
    listDepartments(),
    listPositions(),
    filters.manager ? getPersonName(filters.manager) : null,
    getTranslations('employees'),
    getTranslations('common'),
  ])

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite(user.role) && (
            <ListActions kind="employee" create={{ href: '/employees/new', label: t('new') }} />
          )
        }
      />
      {filters.manager && (
        <Alert tone="info" variant="inline" className="mb-3">
          {t('filters.manager', { name: managerName ?? filters.manager })}{' '}
          <TextLink asChild tone="inherit">
            <Link href={withParams('/employees', query, { manager: undefined, page: undefined })}>
              {t('filters.clearManager')}
            </Link>
          </TextLink>
        </Alert>
      )}
      <EmployeeFilters
        query={query}
        departments={departments}
        positions={positions}
        total={result.total}
      />

      {result.items.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <EmployeesTable
          items={result.items}
          query={query}
          sort={sort}
          canEdit={canWrite(user.role)}
        />
      )}

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={p => withParams('/employees', query, { page: p })}
        linkAs={Link}
        labels={{
          nav: tc('pagination'),
          previous: tc('previous'),
          next: tc('next'),
          status: tc('page', { page: result.page, pageCount: result.pageCount }),
        }}
      />
    </>
  )
}
