'use client'

import type { UpcomingBooking } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { TextLink } from '@muni/ui/text-link'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { BackLink } from '@/components/back-link'
import { useListRead } from '@/components/list-view'
import { usePaginationLabels } from '@/components/pagination-labels'
import { ReadView } from '@/components/read-view'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { RoomLink, SessionDateLink } from '@/components/session-links'
import { TableSkeleton } from '@/components/skeletons'
import { actionsColumn } from '@/components/table-columns'
import { BOOKING_SORT } from '@/lib/list-keys'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import { useListUrl } from '@/lib/use-list-url'

export type GroupKind = 'department' | 'position'

const ENTITY = { department: 'departments', position: 'positions' } as const

/**
 * A department's or position's upcoming bookings: what its list's count stands for. Each of
 * its people's named bookings on a session still ahead, a page at a time, sorted on the
 * server (soonest first by default); admins can remove one.
 */
export function GroupBookingsView({
  kind,
  id,
  canEdit,
}: {
  kind: GroupKind
  id: string
  canEdit: boolean
}) {
  const t = useTranslations('org.bookings')
  const list = useListUrl(BOOKING_SORT, { id: 'date', desc: false })
  const read = useListRead('group-bookings', { kind, id, ...list.input })
  const title = read.data && `${t('title')}: ${read.data.name}`
  useDocumentTitle(title)
  return (
    <ReadView query={read} skeleton={<TableSkeleton columns={4} />} entity={ENTITY[kind]}>
      {({ name, bookings }) => (
        <>
          <PageHeader
            eyebrow={<BackLink fallback={{ href: `/${ENTITY[kind]}/${id}`, label: name }} />}
            title={t('title')}
            description={t('description', { name })}
          />
          {bookings.total === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <BookingsTable
              caption={t('caption', { name })}
              bookings={bookings.items}
              paging={list.paging(bookings)}
              canEdit={canEdit}
            />
          )}
        </>
      )}
    </ReadView>
  )
}

const col = createDataColumns<UpcomingBooking>()

function BookingsTable({
  caption,
  bookings,
  paging,
  canEdit,
}: {
  caption: string
  bookings: UpcomingBooking[]
  paging: TablePaging
  canEdit: boolean
}) {
  const t = useTranslations('org.bookings')
  const tc = useTranslations('common')
  const paginationLabels = usePaginationLabels()
  const columns = useMemo(
    () =>
      col.columns([
        col.accessor(b => b.person.name, {
          id: 'person',
          header: t('columns.person'),
          meta: { sticky: 'left' },
          sortFn: 'text',
          cell: ({ row }) => (
            <TextLink asChild emphasis>
              <Link href={`/employees/${row.original.person.externalId}`}>
                {row.original.person.name}
              </Link>
            </TextLink>
          ),
        }),
        col.accessor('courseName', {
          id: 'course',
          header: t('columns.course'),
          sortFn: 'text',
          cell: ({ row }) => (
            <TextLink asChild>
              <Link href={`/courses/${row.original.courseCode}`}>{row.original.courseName}</Link>
            </TextLink>
          ),
        }),
        col.accessor('startsAt', {
          id: 'date',
          header: t('columns.date'),
          sortFn: 'text',
          meta: { nowrap: true },
          cell: ({ row }) => (
            <SessionDateLink
              session={{
                externalId: row.original.sessionExternalId,
                startsAt: row.original.startsAt,
                endsAt: row.original.endsAt,
              }}
            />
          ),
        }),
        col.accessor(b => b.room.name, {
          id: 'room',
          header: t('columns.room'),
          sortFn: 'text',
          cell: ({ row }) => <RoomLink room={row.original.room} />,
        }),
        ...(canEdit
          ? [
              actionsColumn(col, tc('actions'), b => {
                const names = { name: b.person.name, course: b.courseName }
                return (
                  <RemoveBookingButton
                    sessionExternalId={b.sessionExternalId}
                    employeeExternalId={b.person.externalId}
                    label={t('remove', names)}
                    confirmTitle={t('removeConfirm', names)}
                  />
                )
              }),
            ]
          : []),
      ]),
    [t, tc, canEdit]
  )
  return (
    <DataTable
      caption={caption}
      columns={columns}
      data={bookings}
      getRowId={b => `${b.person.externalId}|${b.sessionExternalId}`}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
