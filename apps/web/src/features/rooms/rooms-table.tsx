'use client'

import type { RoomListItem } from '@muni/db/repositories'
import { UTILISATION_DAYS } from '@muni/domain/rooms'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { Meter } from '@muni/ui/meter'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { CapabilityList, RoomKindBadge } from '@/components/room-badges'

const col = createDataColumns<RoomListItem>()

export function RoomsTable({ rooms }: { rooms: RoomListItem[] }) {
  const t = useTranslations('rooms')
  const tk = useTranslations('status.roomKind')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('name', {
          header: t('columns.name'),
          sortFn: 'text',
          cell: ({ row }) => (
            <TextLink asChild emphasis>
              <Link href={`/rooms/${row.original.id}`}>{row.original.name}</Link>
            </TextLink>
          ),
        }),
        col.accessor(r => tk(r.kind), {
          id: 'kind',
          header: t('columns.kind'),
          sortFn: 'text',
          cell: ({ row }) => <RoomKindBadge kind={row.original.kind} />,
        }),
        // No fixed limit sorts after every number.
        col.accessor(r => r.capacity ?? undefined, {
          id: 'capacity',
          header: t('columns.capacity'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => {
            const capacity = getValue()
            return capacity === undefined ? t('unlimited') : formatInteger(capacity, locale)
          },
        }),
        col.display({
          id: 'capabilities',
          header: t('columns.capabilities'),
          cell: ({ row }) => (
            <CapabilityList capabilities={row.original.capabilities} empty={PLACEHOLDER} />
          ),
        }),
        col.accessor('upcomingSessions', {
          id: 'upcoming',
          header: t('columns.upcoming'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        col.accessor(r => r.utilisation ?? undefined, {
          id: 'utilisation',
          header: t('columns.utilisation', { days: UTILISATION_DAYS }),
          sortFn: 'basic',
          meta: { headerClassName: 'w-52' },
          cell: ({ row }) => {
            const { utilisation } = row.original
            if (utilisation === null) return <span className="text-fg-subtle">{PLACEHOLDER}</span>
            return (
              <BarRow
                layout="inline"
                bar={
                  <Meter
                    value={Math.round(utilisation * 100)}
                    max={100}
                    label={t('columns.utilisation', { days: UTILISATION_DAYS })}
                  />
                }
                value={formatPercent(utilisation, locale)}
              />
            )
          },
        }),
      ]),
    [locale, t, tk]
  )
  return <DataTable columns={columns} data={rooms} getRowId={r => r.id} />
}
