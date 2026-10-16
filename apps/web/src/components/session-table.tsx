'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { Button } from '@muni/ui/button'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { BarRow } from '@muni/ui/bar-row'
import { Meter } from '@muni/ui/meter'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatOptional } from '@muni/utils/format'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { RoomLink, SessionDateLink } from './session-links'
import { OccupancyBadge, seatTone, SessionStatusBadge } from './status-badges'

const col = createDataColumns<SessionListItem>()

export function SessionTable({
  sessions,
  canEdit,
  showCourse = true,
  compact = false,
}: {
  sessions: SessionListItem[]
  canEdit: boolean
  showCourse?: boolean
  /** Course, time and occupancy only, not sortable (dashboard). */
  compact?: boolean
}) {
  const t = useTranslations('sessions')
  const tc = useTranslations('common')
  const locale = useLocale()

  const columns = useMemo(
    () =>
      col.columns([
        ...(showCourse
          ? [
              col.accessor('courseName', {
                id: 'course',
                header: t('columns.course'),
                sortFn: 'text',
                cell: ({ row }) => (
                  <CellStack
                    title={
                      <TextLink asChild emphasis>
                        <Link href={`/courses/${row.original.courseCode}`}>
                          {row.original.courseName}
                        </Link>
                      </TextLink>
                    }
                    meta={`${row.original.courseCode} · ${row.original.externalId}`}
                  />
                ),
              }),
            ]
          : []),
        col.accessor(s => Date.parse(s.startsAt), {
          id: 'date',
          header: t('columns.date'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ row }) => <SessionDateLink session={row.original} />,
        }),
        ...(compact
          ? []
          : [
              col.accessor('location', {
                header: t('columns.location'),
                sortFn: 'text',
                cell: ({ row }) => (
                  <RoomLink location={row.original.location} isOnline={row.original.isOnline} />
                ),
              }),
            ]),
        // Sorts by how full the session is; a session without places sorts last.
        col.accessor(s => (s.capacity > 0 ? s.bookedCount / s.capacity : undefined), {
          id: 'capacity',
          header: t('columns.capacity'),
          sortFn: 'basic',
          meta: { headerClassName: 'w-48' },
          cell: ({ row }) => (
            <BarRow
              layout="inline"
              barClassName="w-20 flex-none"
              bar={
                <Meter
                  value={row.original.bookedCount}
                  max={row.original.capacity}
                  label={t('columns.capacity')}
                  tone={seatTone(row.original.bookedCount, row.original.capacity)}
                />
              }
              value={t('booked', {
                booked: row.original.bookedCount,
                capacity: row.original.capacity,
              })}
              after={
                <OccupancyBadge
                  booked={row.original.bookedCount}
                  capacity={row.original.capacity}
                />
              }
            />
          ),
        }),
        ...(compact
          ? []
          : [
              col.accessor(s => s.pricePerPerson ?? undefined, {
                id: 'price',
                header: t('columns.price'),
                sortFn: 'basic',
                meta: { align: 'right', nowrap: true },
                cell: ({ getValue }) =>
                  formatOptional(getValue(), value => formatCurrency(value, locale)),
              }),
              col.accessor('status', {
                header: t('columns.status'),
                sortFn: 'text',
                cell: ({ getValue }) => <SessionStatusBadge status={getValue()} />,
              }),
            ]),
        ...(canEdit && !compact
          ? [
              col.display({
                id: 'edit',
                header: () => <span className="sr-only">{tc('edit')}</span>,
                meta: { headerClassName: 'w-0' },
                cell: ({ row }) => (
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link
                      href={`/sessions/${row.original.externalId}/edit`}
                      aria-label={t('editTitle', { id: row.original.externalId })}
                    >
                      <Pencil aria-hidden />
                    </Link>
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, compact, locale, showCourse, t, tc]
  )

  return (
    <DataTable
      columns={columns}
      data={sessions}
      getRowId={s => s.externalId}
      enableSorting={!compact}
      rowClassName={s => (s.status === 'CANCELLED' ? 'text-fg-subtle' : undefined)}
      {...(!compact && {
        renderExpanded: (s: SessionListItem) => <AttendeeList session={s} />,
        getRowCanExpand: (s: SessionListItem) => s.assigned.length > 0,
        expandLabel: (s: SessionListItem) => t('attendees.toggle', { id: s.externalId }),
        expandHeader: t('attendees.header'),
      })}
    />
  )
}

/** Who is booked by name, and how many seats are booked without one. */
function AttendeeList({ session }: { session: SessionListItem }) {
  const t = useTranslations('sessions.attendees')
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-fg-muted">
        {t('summary', { named: session.assigned.length, unnamed: session.unnamedBookings })}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {session.assigned.map(a => (
          <li key={a.externalId}>
            <TextLink asChild>
              <Link href={`/employees/${a.externalId}`}>{a.name}</Link>
            </TextLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
