'use client'

import type { PositionSummary } from '@muni/db/repositories'
import { Badge } from '@muni/ui/badge'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { Meter } from '@muni/ui/meter'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { rateTone } from '@/components/status-badges'

import { GroupBreakdown } from './group-breakdown'

const col = createDataColumns<PositionSummary>()

export function PositionsTable({ positions }: { positions: PositionSummary[] }) {
  const t = useTranslations('positions')
  const tDep = useTranslations('departments')
  const locale = useLocale()
  const columns = useMemo(() => {
    const n = (value: number) => formatInteger(value, locale)
    return col.columns([
      col.accessor('name', {
        header: t('columns.name'),
        sortFn: 'text',
        cell: ({ row }) => (
          <TextLink asChild emphasis>
            <Link href={`/positions/${row.original.id}`}>{row.original.name}</Link>
          </TextLink>
        ),
      }),
      col.accessor(p => p.departments.map(g => g.name).join(', '), {
        id: 'departments',
        header: t('columns.departments'),
        sortFn: 'text',
        cell: ({ row }) =>
          row.original.departments.length === 0
            ? PLACEHOLDER
            : row.original.departments.map(g => g.name).join(', '),
      }),
      col.accessor('active', {
        id: 'people',
        header: t('columns.people'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <CellStack
            title={n(row.original.active)}
            meta={
              row.original.parentalLeave > 0
                ? tDep('onLeave', { count: row.original.parentalLeave })
                : undefined
            }
          />
        ),
      }),
      col.accessor(d => (d.counts.total > 0 ? d.rate : undefined), {
        id: 'compliance',
        header: t('columns.compliance'),
        sortFn: 'basic',
        meta: { headerClassName: 'w-52' },
        cell: ({ row }) =>
          row.original.counts.total === 0 ? (
            PLACEHOLDER
          ) : (
            <BarRow
              layout="inline"
              bar={
                <Meter
                  value={row.original.counts.VALID + row.original.counts.EXPIRING}
                  max={row.original.counts.total}
                  label={t('columns.compliance')}
                  tone={rateTone(row.original.rate)}
                />
              }
              value={formatPercent(row.original.rate, locale)}
            />
          ),
      }),
      col.accessor('requiredCourses', {
        id: 'required',
        header: t('columns.required'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) => n(getValue()),
      }),
      col.accessor('actionNow', {
        header: t('columns.actionNow'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) =>
          getValue() > 0 ? <Badge tone="danger">{n(getValue())}</Badge> : n(0),
      }),
      col.accessor('upcomingBookings', {
        id: 'bookings',
        header: t('columns.bookings'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) => n(getValue()),
      }),
    ])
  }, [locale, t, tDep])
  return (
    <DataTable
      columns={columns}
      data={positions}
      getRowId={p => p.id}
      renderExpanded={p => <GroupBreakdown kind="departments" groups={p.departments} />}
      getRowCanExpand={p => p.departments.length > 0}
      expandLabel={p => t('toggle', { name: p.name })}
      expandHeader={t('panelHeader')}
    />
  )
}
