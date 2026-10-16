'use client'

import type { DepartmentSummary } from '@muni/db/repositories'
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

const col = createDataColumns<DepartmentSummary>()

export function DepartmentsTable({ departments }: { departments: DepartmentSummary[] }) {
  const t = useTranslations('departments')
  const locale = useLocale()
  const columns = useMemo(() => {
    const n = (value: number) => formatInteger(value, locale)
    return col.columns([
      col.accessor('name', {
        header: t('columns.name'),
        sortFn: 'text',
        cell: ({ row }) => (
          <TextLink asChild emphasis>
            <Link href={`/departments/${row.original.id}`}>{row.original.name}</Link>
          </TextLink>
        ),
      }),
      col.accessor(d => d.head?.name, {
        id: 'head',
        header: t('columns.head'),
        sortFn: 'text',
        cell: ({ row }) =>
          row.original.head ? (
            <TextLink asChild>
              <Link href={`/employees/${row.original.head.externalId}`}>
                {row.original.head.name}
              </Link>
            </TextLink>
          ) : (
            PLACEHOLDER
          ),
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
                ? t('onLeave', { count: row.original.parentalLeave })
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
  }, [locale, t])
  return (
    <DataTable
      columns={columns}
      data={departments}
      getRowId={d => d.id}
      renderExpanded={d => <GroupBreakdown kind="positions" groups={d.positions} />}
      getRowCanExpand={d => d.positions.length > 0}
      expandLabel={d => t('toggle', { name: d.name })}
      expandHeader={t('panelHeader')}
    />
  )
}
