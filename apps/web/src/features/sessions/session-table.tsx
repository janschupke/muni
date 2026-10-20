'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { sessionPhase } from '@muni/domain/sessions'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { CellStack } from '@muni/ui/table'
import { formatCurrency } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { RecordLink } from '@/components/badges/archived'
import { SessionStatusBadge } from '@/components/badges/status-badges'
import { usePaginationLabels } from '@/components/table/pagination-labels'
import { rowActionsColumn } from '@/components/table/table-columns'
import { sessionTarget } from '@/features/sessions/session-target'
import { readQuery } from '@/lib/query/queries'

import { SeatMeter } from './seat-meter'
import { SessionBookings } from './session-bookings'
import { SessionFacts } from './session-details'
import { RoomLink, SessionDateLink } from './session-links'

const col = createDataColumns<SessionListItem>()

export function SessionTable({
  sessions,
  canEdit,
  showCourse = true,
  showRoom = true,
  showProvider = true,
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
  /** False on a room's page, where every row is that room. */
  showRoom?: boolean | undefined
  /** False on a provider's page, where every row is that provider. */
  showProvider?: boolean | undefined
  /** Course, time and occupancy only, not sortable (dashboard). */
  compact?: boolean | undefined
  /** The table's accessible name: "Sessions" unless the section names them otherwise. */
  caption?: string | undefined
  /** An opened row's panels head with `h2`s, or `h3`s under a section's `h2`. */
  panelLevel?: 2 | 3 | undefined
}) {
  const t = useTranslations('sessions')
  const paginationLabels = usePaginationLabels()

  const columns = useSessionColumns({ canEdit, compact, showCourse, showProvider, showRoom })

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
        renderExpanded: (s: SessionListItem) => (
          <SessionDetails session={s} level={panelLevel} canEdit={canEdit} />
        ),
        expandLabel: (s: SessionListItem) => t('attendees.toggle', { id: s.externalId }),
        expandHeader: t('attendees.header'),
      })}
    />
  )
}

/**
 * An opened session: the session itself (when, the room against what the course needs, the
 * seats, the price, the status) and who is booked on it by name, how and when, with, for
 * admins, the way to book someone who needs it or cancel a booking. Its page shows the same
 * two parts (`SessionFacts`, `SessionBookings`).
 */
function SessionDetails({
  session: s,
  level,
  canEdit,
}: {
  session: SessionListItem
  level: 2 | 3
  canEdit: boolean
}) {
  const t = useTranslations('sessions.expanded')
  const ahead = sessionPhase(s, new Date()) === 'AHEAD'
  // Who needs the course, read when the row opens: the list itself stays light.
  const candidates = useQuery({
    ...readQuery('session-candidates', { externalId: s.externalId }),
    enabled: canEdit && ahead,
  })
  return (
    <DetailGrid layout="narrow-wide">
      <DetailPanel title={t('session')} level={level}>
        <SessionFacts session={s} />
      </DetailPanel>
      <DetailPanel title={t('people')} count={s.bookings.length} level={level}>
        <SessionBookings
          session={s}
          canEdit={canEdit}
          needing={candidates.data?.needing ?? (candidates.isError ? [] : 'loading')}
        />
      </DetailPanel>
    </DetailGrid>
  )
} /** Which columns a session table shows: every place lists sessions a little differently. */
interface ColumnChoice {
  canEdit: boolean
  /** Course, time and occupancy only (dashboard). */
  compact: boolean
  showCourse: boolean
  showProvider: boolean
  showRoom: boolean
}

/**
 * A session table's columns: the course, when, the room, the provider, how booked, the price,
 * the status and, for admins, the row's actions; a place that is one room or one provider drops
 * its column, the dashboard keeps the essentials.
 */
function useSessionColumns({ canEdit, compact, showCourse, showProvider, showRoom }: ColumnChoice) {
  const t = useTranslations('sessions')
  const tc = useTranslations('common')
  return useMemo(
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
        ...(compact || !showRoom
          ? []
          : [
              col.accessor(s => s.room.name, {
                id: 'room',
                header: t('columns.room'),
                sortFn: 'text',
                cell: ({ row }) => <RoomLink room={row.original.room} />,
              }),
            ]),
        ...(compact || !showProvider
          ? []
          : [
              col.accessor(s => s.provider.name, {
                id: 'provider',
                header: t('columns.provider'),
                sortFn: 'text',
                cell: ({ row }) => (
                  <RecordLink
                    href={`/providers/${row.original.provider.id}`}
                    archived={row.original.provider.archived}
                  >
                    {row.original.provider.name}
                  </RecordLink>
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
          ? [rowActionsColumn(col, tc('actions'), r => sessionTarget(r, { row: true }))]
          : []),
      ]),
    [canEdit, compact, showCourse, showProvider, showRoom, t, tc]
  )
}
