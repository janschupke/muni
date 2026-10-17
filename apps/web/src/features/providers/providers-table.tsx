'use client'

import type { ProviderListItem } from '@muni/db/repositories'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { RowActions } from '@/components/record-actions'

const col = createDataColumns<ProviderListItem>()

/** Every provider with what was completed with it; spend only for viewers who see prices. */
export function ProvidersTable({
  providers,
  prices,
  canEdit = false,
}: {
  providers: ProviderListItem[]
  prices: boolean
  /** Admins get a pencil and archive on each row. */
  canEdit?: boolean | undefined
}) {
  const t = useTranslations('providers.columns')
  const tp = useTranslations('providers')
  const tcommon = useTranslations('common')
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
        ...(canEdit
          ? [
              col.display({
                id: 'actions',
                header: () => <span className="sr-only">{tcommon('actions')}</span>,
                meta: { headerClassName: 'w-0', align: 'right' },
                cell: ({ row }) => (
                  <RowActions
                    kind="provider"
                    id={row.original.id}
                    name={row.original.name}
                    editHref={`/providers/${row.original.id}/edit`}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, locale, prices, t, tcommon]
  )
  return <DataTable caption={tp('title')} columns={columns} data={providers} getRowId={p => p.id} />
}
