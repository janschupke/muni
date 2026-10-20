'use client'

import { EMPLOYEE_SORT_KEYS } from '@muni/domain/enums'
import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { ListSkeleton } from '@/components/views/skeletons'
import { EmployeeFilters } from '@/features/employees/employee-filters'
import { EmployeesTable } from '@/features/employees/employees-table'
import { type EmployeeListFilters, employeesListInput } from '@/lib/list/read-inputs'
import { useListUrl } from '@/lib/list/use-list-url'

/**
 * The employee list as the address asks for it (filters, sort, page). Changing them keeps the
 * current rows on screen, dimmed, until the next page of the list is there.
 */
export function EmployeesView({
  filters,
  canEdit,
}: {
  filters: EmployeeListFilters
  canEdit: boolean
}) {
  const t = useTranslations('employees')
  const list = useListUrl(EMPLOYEE_SORT_KEYS, { id: 'name', desc: false })
  // Everything that shapes the list but the page; filter changes carry it along.
  const query = { ...filters, sort: list.input.sort, dir: list.input.dir }
  return (
    <ListView
      kind="employee"
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      canEdit={canEdit}
      create={{ href: '/employees/new', label: t('new') }}
      read={useListRead('employees-list', employeesListInput(filters, list.input))}
      skeleton={<ListSkeleton columns={6} />}
      totalOf={({ result }) => result.total}
      above={({ result, departments, positions, managerName }) => (
        <EmployeeFilters
          query={query}
          departments={departments}
          positions={positions}
          total={result.total}
          manager={
            filters.manager === undefined
              ? undefined
              : { label: t('filters.manager', { name: managerName ?? filters.manager }) }
          }
        />
      )}
    >
      {({ result }) => (
        <EmployeesTable
          items={result.items}
          paging={list.paging(result)}
          canEdit={canEdit}
          canBook={canEdit}
        />
      )}
    </ListView>
  )
}
