'use client'

import type { ProviderListItem } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { formatCurrency, formatDate, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { usePaginationLabels } from '@/components/table/pagination-labels'
import { nameColumn, rowActionsColumn } from '@/components/table/table-columns'

const col = createDataColumns<ProviderListItem>()

/** Every provider with what was completed with it; spend only for viewers who see prices. */
export function ProvidersTable({
  providers,
  paging,
  prices,
  canEdit = false,
}: {
  providers: ProviderListItem[]
  paging: TablePaging
  prices: boolean
  /** Admins get a pencil and archive on each row. */
  canEdit?: boolean | undefined
}) {
  const t = useTranslations('providers.columns')
  const tp = useTranslations('providers')
  const tcommon = useTranslations('common')
  const locale = useLocale()
  const paginationLabels = usePaginationLabels()
  const columns = useMemo(
    () =>
      col.columns([
        nameColumn(col, { header: t('name'), name: p => p.name, href: p => `/providers/${p.id}` }),
        col.accessor(p => p.companyId ?? undefined, {
          id: 'companyId',
          header: t('companyId'),
          sortFn: 'text',
          meta: { nowrap: true },
          cell: ({ getValue }) => getValue() ?? PLACEHOLDER,
        }),
        col.accessor('completions', {
          header: t('completions'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        col.accessor('people', {
          header: t('people'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        col.accessor('courses', {
          header: t('courses'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        ...(prices
          ? [
              col.accessor(p => p.spend ?? undefined, {
                id: 'spend',
                header: t('spend'),
                sortFn: 'basic',
                meta: { align: 'right', nowrap: true },
                cell: ({ getValue }) => formatCurrency(getValue()),
              }),
            ]
          : []),
        col.accessor(p => p.lastCompletedOn ?? undefined, {
          id: 'last',
          header: t('last'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? PLACEHOLDER : formatDate(value)
          },
        }),
        ...(canEdit
          ? [
              rowActionsColumn(col, tcommon('actions'), r => ({
                kind: 'provider',
                id: r.id,
                name: r.name,
                editHref: `/providers/${r.id}/edit`,
              })),
            ]
          : []),
      ]),
    [canEdit, locale, prices, t, tcommon]
  )
  return (
    <DataTable
      caption={tp('title')}
      columns={columns}
      data={providers}
      getRowId={p => p.id}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
