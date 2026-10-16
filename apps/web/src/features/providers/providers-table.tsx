'use client'

import type { ProviderListItem } from '@muni/db/repositories'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

const col = createDataColumns<ProviderListItem>()

/** Every provider with what was completed with it; spend only for viewers who see prices. */
export function ProvidersTable({
  providers,
  prices,
}: {
  providers: ProviderListItem[]
  prices: boolean
}) {
  const t = useTranslations('providers.columns')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('name', {
          header: t('name'),
          sortFn: 'text',
          cell: ({ row }) => (
            <TextLink asChild emphasis>
              <Link href={`/providers/${row.original.id}`}>{row.original.name}</Link>
            </TextLink>
          ),
        }),
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
                cell: ({ getValue }) => formatCurrency(getValue(), locale),
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
            return value === undefined ? PLACEHOLDER : formatDate(value, locale)
          },
        }),
      ]),
    [locale, prices, t]
  )
  return <DataTable columns={columns} data={providers} getRowId={p => p.id} />
}
