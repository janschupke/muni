'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { Meter } from '@muni/ui/meter'
import { CellStack } from '@muni/ui/table'
import { formatCurrency } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { useOfTotal } from '@/lib/use-of-total'

import { RecordLink } from './archived'
import { RowActions } from './record-actions'
import { SessionAttendees, SessionFacts } from './session-details'
import { RoomLink, SessionDateLink } from './session-links'
import { OccupancyBadge, seatTone, SessionStatusBadge } from './status-badges'

const col = createDataColumns<SessionListItem>()

export function SessionTable({
  sessions,
  canEdit,
  showCourse = true,
  compact = false,
  caption,
  panelLevel = 2,
}: {
  sessions: SessionListItem[]
  canEdit: boolean
  showCourse?: boolean | undefined
  /** Course, time and occupancy only, not sortable (dashboard). */
  compact?: boolean | undefined
  /** The table's accessible name: "Sessions" unless the section names them otherwise. */
  caption?: string | undefined
  /** An opened row's panels head with `h2`s, or `h3`s under a section's `h2`. */
  panelLevel?: 2 | 3 | undefined
}) {
  const t = useTranslations('sessions')
  const tc = useTranslations('common')
  const locale = useLocale()
  const ofTotal = useOfTotal()

  const columns = useMemo(
    () =>
      col.columns([
        ...(showCourse
          ? [
              col.accessor('courseName', {
                id: 'course',
                header: t('columns.course'),
                // On a phone the table scrolls sideways; the name stays in view.
                meta: { sticky: 'left' },
                sortFn: 'text',
                cell: ({ row }) => (
                  <CellStack
                    title={
                      <RecordLink
                        href={`/courses/${row.original.courseCode}`}
                        archived={row.original.courseArchived}
                        emphasis
                      >
                        {row.original.courseName}
                      </RecordLink>
                    }
                    meta={
                      // Compact rows have no status column: a cancelled one still says so.
                      compact && row.original.status === 'CANCELLED' ? (
                        <>
                          {`${row.original.courseCode} · ${row.original.externalId}`}{' '}
                          <SessionStatusBadge status="CANCELLED" />
                        </>
                      ) : (
                        `${row.original.courseCode} · ${row.original.externalId}`
                      )
                    }
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
              col.accessor(s => s.room.name, {
                id: 'room',
                header: t('columns.room'),
                sortFn: 'text',
                cell: ({ row }) => <RoomLink room={row.original.room} />,
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
              value={ofTotal(row.original.bookedCount, row.original.capacity)}
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
                cell: ({ getValue }) => formatCurrency(getValue(), locale),
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
                id: 'actions',
                header: () => <span className="sr-only">{tc('actions')}</span>,
                meta: { headerClassName: 'w-0', align: 'right' },
                cell: ({ row }) => (
                  <RowActions
                    kind="session"
                    id={row.original.id}
                    name={`${row.original.externalId} · ${row.original.courseName}`}
                    editHref={`/sessions/${row.original.externalId}/edit`}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, compact, locale, ofTotal, showCourse, t, tc]
  )

  return (
    <DataTable
      caption={caption ?? t('title')}
      columns={columns}
      data={sessions}
      getRowId={s => s.externalId}
      enableSorting={!compact}
      rowClassName={s => (s.status === 'CANCELLED' ? 'text-fg-subtle' : undefined)}
      {...(!compact && {
        renderExpanded: (s: SessionListItem) => <SessionDetails session={s} level={panelLevel} />,
        expandLabel: (s: SessionListItem) => t('attendees.toggle', { id: s.externalId }),
        expandHeader: t('attendees.header'),
      })}
    />
  )
}

/**
 * An opened session: the session itself (when, the room against what the course needs, the
 * seats, the price, the status) and who is booked on it by name, how and when. Its page shows
 * the same two parts.
 */
function SessionDetails({ session: s, level }: { session: SessionListItem; level: 2 | 3 }) {
  const t = useTranslations('sessions.expanded')
  const ta = useTranslations('sessions.attendees')
  const named = s.bookings.length
  return (
    <DetailGrid layout="narrow-wide">
      <DetailPanel title={t('session')} level={level}>
        <SessionFacts session={s} />
      </DetailPanel>
      <DetailPanel title={t('people')} count={named} flush={named > 0} level={level}>
        {named === 0 ? (
          <EmptyState variant="inline" title={ta('noneNamed')} />
        ) : (
          <SessionAttendees session={s} />
        )}
      </DetailPanel>
    </DetailGrid>
  )
}
