'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { roomMismatch } from '@muni/domain/rooms'
import { Badge } from '@muni/ui/badge'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { Meter } from '@muni/ui/meter'
import { CellStack, Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { toZonedParts } from '@muni/utils/dates'
import { formatCurrency, formatDate, formatTimeRange, PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { PersonLink, RecordLink } from './archived'
import { RowActions } from './record-actions'
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
  showCourse?: boolean | undefined
  /** Course, time and occupancy only, not sortable (dashboard). */
  compact?: boolean | undefined
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
                      <RecordLink
                        href={`/courses/${row.original.courseCode}`}
                        archived={row.original.courseArchived}
                        emphasis
                      >
                        {row.original.courseName}
                      </RecordLink>
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
              col.accessor(s => s.room.name, {
                id: 'location',
                header: t('columns.location'),
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
                    name={row.original.externalId}
                    editHref={`/sessions/${row.original.externalId}/edit`}
                  />
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
        renderExpanded: (s: SessionListItem) => <SessionDetails session={s} />,
        expandLabel: (s: SessionListItem) => t('attendees.toggle', { id: s.externalId }),
        expandHeader: t('attendees.header'),
      })}
    />
  )
}

/**
 * An opened session: the session itself (when, the room against what the course needs, the
 * seats, the price, the status) and who is booked on it by name, how and when.
 */
function SessionDetails({ session: s }: { session: SessionListItem }) {
  const t = useTranslations('sessions.expanded')
  const ta = useTranslations('sessions.attendees')
  const tu = useTranslations('forms.session.unfit')
  const tcap = useTranslations('status.capability')
  const locale = useLocale()
  const named = s.bookings.length
  const free = Math.max(0, s.capacity - s.bookedCount)
  const over = Math.max(0, s.bookedCount - s.capacity)
  const room = { ...s.room, capacity: s.roomSeats, capabilities: s.roomCapabilities }
  const unfit = roomMismatch(room, s.needs, s.capacity)
  const needs = [
    ...(s.needs.sessionMinutes === null ? [] : [t('minutes', { count: s.needs.sessionMinutes })]),
    ...(s.needs.groupSize === null ? [] : [t('groupSize', { count: s.needs.groupSize })]),
    ...(s.needs.onlineAllowed ? [t('canBeOnline')] : []),
    ...(s.needs.capabilities.length > 0
      ? [t('equipment', { list: s.needs.capabilities.map(c => tcap(c)).join(', ') })]
      : []),
  ]
  return (
    <DetailGrid className="lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <DetailPanel title={t('session')}>
        <DescriptionList>
          <DescriptionItem label={t('when')}>
            {formatTimeRange(s.startsAt, s.endsAt, locale)}
          </DescriptionItem>
          <DescriptionItem label={t('room')}>
            <span className="flex flex-col gap-0.5">
              <span>
                <RoomLink room={s.room} />
                {' · '}
                {s.roomSeats === null ? t('roomOnline') : t('roomSeats', { seats: s.roomSeats })}
              </span>
              <span className={unfit ? 'text-danger-fg' : 'text-fg-muted'}>
                {unfit ? t('unfit', { reason: tu(unfit.kind) }) : t('fits')}
              </span>
            </span>
          </DescriptionItem>
          {needs.length > 0 && (
            <DescriptionItem label={t('needs')}>{needs.join(' · ')}</DescriptionItem>
          )}
          <DescriptionItem label={t('seats')}>
            <BarRow
              layout="inline"
              bar={
                <Meter
                  value={s.bookedCount}
                  max={s.capacity}
                  label={t('seats')}
                  tone={seatTone(s.bookedCount, s.capacity)}
                />
              }
              value={`${String(s.bookedCount)} / ${String(s.capacity)}`}
            />
            <span className="mt-1 block text-xs text-fg-muted">
              {t('seatsText', { named, unnamed: s.unnamedBookings, free })}
              {over > 0 && <span className="text-danger-fg"> · {t('over', { count: over })}</span>}
            </span>
          </DescriptionItem>
          <DescriptionItem label={t('price')}>
            {s.pricePerPerson === null
              ? t('noPrice')
              : t('priceText', {
                  price: formatCurrency(s.pricePerPerson, locale),
                  total: formatCurrency(s.pricePerPerson * s.bookedCount, locale),
                  booked: s.bookedCount,
                })}
          </DescriptionItem>
          <DescriptionItem label={t('status')}>
            <SessionStatusBadge status={s.status} />
          </DescriptionItem>
        </DescriptionList>
      </DetailPanel>
      <DetailPanel title={t('people')} count={named} flush={named > 0}>
        {named === 0 ? (
          <EmptyState variant="inline" title={ta('noneNamed')} />
        ) : (
          <Table density="compact" aria-label={t('people')}>
            <THead>
              <tr>
                <Th>{t('person')}</Th>
                <Th>{t('department')}</Th>
                <Th>{t('position')}</Th>
                <Th>{t('via')}</Th>
                <Th>{t('bookedOn')}</Th>
              </tr>
            </THead>
            <TBody>
              {s.bookings.map(b => (
                <Tr key={b.person.archived ? b.person.tag : b.person.externalId}>
                  <Td>
                    <PersonLink person={b.person} />
                  </Td>
                  <Td>{b.department ?? PLACEHOLDER}</Td>
                  <Td>{b.position ?? PLACEHOLDER}</Td>
                  <Td>
                    <Badge tone={b.source === 'ADVISOR' ? 'accent' : 'neutral'}>
                      {b.source === 'ADVISOR' ? t('viaAdvisor') : t('viaManual')}
                    </Badge>
                  </Td>
                  <Td nowrap>{formatDate(toZonedParts(b.bookedAt).date, locale)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </DetailPanel>
    </DetailGrid>
  )
}
