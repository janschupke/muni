'use client'

import type { DepartmentSummary, PositionSummary } from '@muni/db/repositories'
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

import { PersonLink, personText } from '@/components/archived'
import { rateTone } from '@/components/status-badges'

import { MembersTable } from './members-table'

type Group = DepartmentSummary | PositionSummary

const col = createDataColumns<Group>()

/**
 * Departments or positions: who leads each (departments) or where it sits (positions), its
 * people, how its mandatory training stands. A row opens to the records of its people.
 */
export function GroupsTable(
  props:
    | { kind: 'departments'; groups: DepartmentSummary[] }
    | { kind: 'positions'; groups: PositionSummary[] }
) {
  const { kind } = props
  const t = useTranslations(kind)
  const to = useTranslations('org')
  const locale = useLocale()
  const columns = useMemo(() => {
    const n = (value: number) => formatInteger(value, locale)
    return col.columns([
      col.accessor('name', {
        header: t('columns.name'),
        sortFn: 'text',
        cell: ({ row }) => (
          <TextLink asChild emphasis>
            <Link href={`/${kind}/${row.original.id}`}>{row.original.name}</Link>
          </TextLink>
        ),
      }),
      kind === 'departments'
        ? col.accessor(g => ('head' in g && g.head ? personText(g.head) : undefined), {
            id: 'head',
            header: t('columns.head'),
            sortFn: 'text',
            cell: ({ row }) => {
              const head = 'head' in row.original ? row.original.head : null
              return head ? <PersonLink person={head} /> : PLACEHOLDER
            },
          })
        : col.accessor(g => ('departments' in g ? g.departments.map(d => d.name).join(', ') : ''), {
            id: 'departments',
            header: t('columns.departments'),
            sortFn: 'text',
            cell: ({ getValue }) => getValue() || PLACEHOLDER,
          }),
      col.accessor('active', {
        id: 'people',
        header: to('columns.people'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <CellStack
            title={n(row.original.active)}
            meta={
              row.original.parentalLeave > 0
                ? to('onLeave', { count: row.original.parentalLeave })
                : undefined
            }
          />
        ),
      }),
      col.accessor(g => (g.counts.total > 0 ? g.rate : undefined), {
        id: 'compliance',
        header: to('columns.compliance'),
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
                  label={to('columns.compliance')}
                  tone={rateTone(row.original.rate)}
                />
              }
              value={formatPercent(row.original.rate, locale)}
            />
          ),
      }),
      col.accessor('requiredCourses', {
        id: 'required',
        header: to('columns.required'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) => n(getValue()),
      }),
      col.accessor('actionNow', {
        header: to('columns.actionNow'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) =>
          getValue() > 0 ? <Badge tone="danger">{n(getValue())}</Badge> : n(0),
      }),
      col.accessor('upcomingBookings', {
        id: 'bookings',
        header: to('columns.bookings'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) => n(getValue()),
      }),
    ])
  }, [kind, locale, t, to])
  return (
    <DataTable<Group>
      columns={columns}
      data={props.groups}
      getRowId={g => g.id}
      renderExpanded={g => (
        <MembersTable
          name={g.name}
          members={g.members}
          other={kind === 'departments' ? 'position' : 'department'}
        />
      )}
      getRowCanExpand={g => g.members.length > 0}
      expandLabel={g => t('toggle', { name: g.name })}
      expandHeader={to('panelHeader')}
    />
  )
}
