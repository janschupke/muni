'use client'

import { EMPLOYEE_SORT_KEYS } from '@muni/domain/enums'
import { cn } from '@muni/ui/cn'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { EmployeeFilters } from '@/components/employee-filters'
import { EmployeesTable } from '@/components/employees-table'
import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { ListSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { type EmployeeListFilters, employeesListInput } from '@/lib/read-inputs'
import { useListUrl } from '@/lib/use-list-url'

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
  const read = useQuery({
    ...readQuery('employees-list', employeesListInput(filters, list.input)),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canEdit && (
            <ListActions kind="employee" create={{ href: '/employees/new', label: t('new') }} />
          )
        }
      />
      <ReadView titled query={read} skeleton={<ListSkeleton columns={6} />}>
        {({ result, departments, positions, managerName }) => (
          <div
            aria-busy={read.isPlaceholderData || undefined}
            className={cn('transition-opacity', read.isPlaceholderData && 'opacity-60')}
          >
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
            {result.total === 0 ? (
              <EmptyState title={t('empty')} />
            ) : (
              <EmployeesTable
                items={result.items}
                paging={list.paging(result)}
                canEdit={canEdit}
                canBook={canEdit}
              />
            )}
          </div>
        )}
      </ReadView>
    </>
  )
}
