'use client'

import type { EmployeeSortKey } from '@muni/db/repositories'
import type { ComplianceStatus, EmploymentState } from '@muni/domain/enums'
import { Alert } from '@muni/ui/alert'
import { cn } from '@muni/ui/cn'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Pagination } from '@muni/ui/pagination'
import { TextLink } from '@muni/ui/text-link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { EmployeeFilters } from '@/components/employee-filters'
import { EmployeesTable } from '@/components/employees-table'
import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { ListSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { withParams } from '@/lib/search-params'

export interface EmployeeListFilters {
  q?: string | undefined
  department?: string | undefined
  position?: string | undefined
  status?: EmploymentState | undefined
  compliance?: ComplianceStatus | undefined
  manager?: string | undefined
}

/**
 * The employee list as the address asks for it (filters, sort, page). Changing them keeps the
 * current rows on screen, dimmed, until the next page of the list is there.
 */
export function EmployeesView({
  filters,
  sort,
  page,
  canEdit,
}: {
  filters: EmployeeListFilters
  sort: { by: EmployeeSortKey; desc: boolean } | undefined
  page: number
  canEdit: boolean
}) {
  const t = useTranslations('employees')
  const tc = useTranslations('common')
  // Everything that shapes the list; page links and filter changes carry it along.
  const query = { ...filters, sort: sort?.by, dir: sort?.desc ? ('desc' as const) : undefined }
  const read = useQuery({
    ...readQuery('employees-list', { ...query, page }),
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
      <ReadView query={read} skeleton={<ListSkeleton columns={6} />}>
        {({ result, departments, positions, managerName }) => (
          <div
            aria-busy={read.isPlaceholderData || undefined}
            className={cn('transition-opacity', read.isPlaceholderData && 'opacity-60')}
          >
            {filters.manager && (
              <Alert tone="info" variant="inline" className="mb-3">
                {t('filters.manager', { name: managerName ?? filters.manager })}{' '}
                <TextLink asChild tone="inherit">
                  <Link
                    href={withParams('/employees', query, { manager: undefined, page: undefined })}
                  >
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
              <EmployeesTable items={result.items} query={query} sort={sort} canEdit={canEdit} />
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
          </div>
        )}
      </ReadView>
    </>
  )
}
