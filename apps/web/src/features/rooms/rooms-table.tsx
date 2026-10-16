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

import { RowActions } from '@/components/record-actions'
import { CapabilityList, RoomKindBadge } from '@/components/room-badges'

const col = createDataColumns<RoomListItem>()

export function RoomsTable({
  rooms,
  canEdit = false,
}: {
  rooms: RoomListItem[]
  /** Admins get a pencil and archive on each row. */
  canEdit?: boolean | undefined
}) {
  const t = useTranslations('rooms')
  const tcommon = useTranslations('common')
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
        ...(canEdit
          ? [
              col.display({
                id: 'actions',
                header: () => <span className="sr-only">{tcommon('actions')}</span>,
                meta: { headerClassName: 'w-0', align: 'right' },
                cell: ({ row }) => (
                  <RowActions
                    kind="room"
                    id={row.original.id}
                    name={row.original.name}
                    editHref={`/rooms/${row.original.id}/edit`}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, locale, t, tk, tcommon]
  )
  return <DataTable columns={columns} data={rooms} getRowId={r => r.id} />
}
