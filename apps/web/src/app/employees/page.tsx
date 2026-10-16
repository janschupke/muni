import { listDepartments, listEmployees } from '@muni/db/repositories'
import { COMPLIANCE_STATUSES, EMPLOYMENT_STATUSES } from '@muni/domain/enums'
import { buttonClass } from '@muni/ui/button'
import { EmptyState } from '@muni/ui/empty-state'
import { Input, Select } from '@muni/ui/field'
import { PageHeader } from '@muni/ui/page-header'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { ComplianceBadge, EmploymentBadge } from '@/components/status-badges'
import { Pagination } from '@/components/pagination'
import { oneOf, param, withParams, type SearchParams } from '@/lib/search-params'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('employees'))('title') }
}

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const filters = {
    q: param(params, 'q'),
    department: param(params, 'department'),
    status: oneOf(param(params, 'status'), EMPLOYMENT_STATUSES),
    compliance: oneOf(param(params, 'compliance'), COMPLIANCE_STATUSES),
  }
  const page = Number(param(params, 'page') ?? 1) || 1
  const [result, departments, t, ts] = await Promise.all([
    listEmployees({ ...filters, page }),
    listDepartments(),
    getTranslations('employees'),
    getTranslations('status'),
  ])

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />

      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('search')}</span>
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={t('searchPlaceholder')}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('filters.department')}</span>
          <Select name="department" defaultValue={filters.department ?? ''} className="w-52">
            <option value="">{t('filters.any')}</option>
            {departments.map(d => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('filters.status')}</span>
          <Select name="status" defaultValue={filters.status ?? ''} className="w-40">
            <option value="">{t('filters.any')}</option>
            {EMPLOYMENT_STATUSES.map(s => (
              <option key={s} value={s}>
                {ts(`employment.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('filters.compliance')}</span>
          <Select name="compliance" defaultValue={filters.compliance ?? ''} className="w-40">
            <option value="">{t('filters.any')}</option>
            {COMPLIANCE_STATUSES.map(s => (
              <option key={s} value={s}>
                {ts(`compliance.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={buttonClass({ variant: 'primary' })}>
          {t('filters.apply')}
        </button>
        <Link href="/employees" className={buttonClass({ variant: 'ghost' })}>
          {t('filters.reset')}
        </Link>
        <span className="ml-auto text-sm text-fg-muted">{t('total', { count: result.total })}</span>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{t('columns.name')}</Th>
                <Th>{t('columns.department')}</Th>
                <Th>{t('columns.position')}</Th>
                <Th>{t('columns.status')}</Th>
                <Th>{t('columns.compliance')}</Th>
                <Th className="text-right">{t('columns.required')}</Th>
              </tr>
            </THead>
            <TBody>
              {result.items.map(e => (
                <Tr key={e.externalId}>
                  <Td>
                    <Link
                      href={`/employees/${e.externalId}`}
                      className="font-medium hover:underline"
                    >
                      {e.lastName} {e.firstName}
                    </Link>
                    <div className="text-xs text-fg-subtle">{e.externalId}</div>
                  </Td>
                  <Td>{e.department ?? '—'}</Td>
                  <Td>{e.position ?? '—'}</Td>
                  <Td>
                    <EmploymentBadge status={e.status} />
                  </Td>
                  <Td>
                    <ComplianceBadge status={e.status === 'TERMINATED' ? null : e.compliance} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {e.counts.total > 0
                      ? `${e.counts.VALID + e.counts.EXPIRING} / ${e.counts.total}`
                      : '—'}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={p => withParams('/employees', { ...filters }, { page: p })}
      />
    </>
  )
}
