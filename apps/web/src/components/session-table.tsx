'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { CellStack } from '@muni/ui/table'
import { formatCurrency } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { RecordLink } from './archived'
import { usePaginationLabels } from './pagination-labels'
import { SeatMeter } from './seat-meter'
import { SessionAttendees, SessionFacts } from './session-details'
import { RoomLink, SessionDateLink } from './session-links'
import { SessionStatusBadge } from './status-badges'
import { rowActionsColumn } from './table-columns'

const col = createDataColumns<SessionListItem>()

export function SessionTable({
  sessions,
  canEdit,
  showCourse = true,
  compact = false,
  caption,
  panelLevel = 2,
  paging,
}: {
  sessions: SessionListItem[]
  /** Server pages, or why every row is here (the dashboard's preview). */
  paging: TablePaging
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
  const paginationLabels = usePaginationLabels()

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
            <SeatMeter
              booked={row.original.bookedCount}
              capacity={row.original.capacity}
              label={t('columns.capacity')}
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
                cell: ({ getValue }) => formatCurrency(getValue()),
              }),
              col.accessor('status', {
                header: t('columns.status'),
                sortFn: 'text',
                cell: ({ getValue }) => <SessionStatusBadge status={getValue()} />,
              }),
            ]),
        ...(canEdit && !compact
          ? [
              rowActionsColumn(col, tc('actions'), r => ({
                kind: 'session',
                id: r.id,
                name: `${r.externalId} · ${r.courseName}`,
                editHref: `/sessions/${r.externalId}/edit`,
              })),
            ]
          : []),
      ]),
    [canEdit, compact, showCourse, t, tc]
  )

  return (
    <DataTable
      caption={caption ?? t('title')}
      columns={columns}
      data={sessions}
      getRowId={s => s.externalId}
      paging={paging}
      paginationLabels={paginationLabels}
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
