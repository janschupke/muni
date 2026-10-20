'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { roomMismatch } from '@muni/domain/rooms'
import { Badge } from '@muni/ui/badge'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { toZonedParts } from '@muni/utils/dates'
import { formatCurrency, formatDate, formatSessionTime } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { PersonLink, RecordLink } from '@/components/badges/archived'
import { SessionStatusBadge } from '@/components/badges/status-badges'
import { OrgLink } from '@/features/org/org-links'

import { SeatMeter } from './seat-meter'
import { RoomLink } from './session-links'

type Booking = SessionListItem['bookings'][number]

/**
 * A session's facts, the same in an opened row and on its own page: when, the room against
 * what the course needs, the seats, the price and the status. The page adds the course and
 * the session's ID (`full`).
 */
export function SessionFacts({
  session: s,
  full = false,
}: {
  session: SessionListItem
  full?: boolean | undefined
}) {
  const t = useTranslations('sessions.expanded')
  const tu = useTranslations('forms.session.unfit')
  const tcap = useTranslations('status.capability')
  const free = Math.max(0, s.capacity - s.bookedCount)
  const over = Math.max(0, s.bookedCount - s.capacity)
  const room = { ...s.room, capacity: s.roomSeats, capabilities: s.roomCapabilities }
  const unfit = roomMismatch(room, s.needs, s.capacity)
  const needs = [
    ...(s.needs.sessionMinutes === null ? [] : [t('minutes', { count: s.needs.sessionMinutes })]),
    ...(s.needs.seats === null ? [] : [t('courseSeats', { count: s.needs.seats })]),
    ...(s.needs.onlineAllowed ? [t('canBeOnline')] : []),
    ...(s.needs.capabilities.length > 0
      ? [t('equipment', { list: s.needs.capabilities.map(c => tcap(c)).join(', ') })]
      : []),
  ]
  return (
    <DescriptionList>
      {full && (
        <DescriptionItem label={t('course')}>
          <TextLink asChild emphasis>
            <Link href={`/courses/${s.courseCode}`}>{s.courseName}</Link>
          </TextLink>
        </DescriptionItem>
      )}
      <DescriptionItem label={t('when')}>{formatSessionTime(s)}</DescriptionItem>
      <DescriptionItem label={t('provider')}>
        <RecordLink href={`/providers/${s.provider.id}`} archived={s.provider.archived}>
          {s.provider.name}
        </RecordLink>
      </DescriptionItem>
      <DescriptionItem label={t('room')}>
        <span className="flex flex-col gap-0.5">
          <span>
            <RoomLink room={s.room} />
          </span>
          <span>
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
        {/* An opened row shows the seats' bar in its own column already. */}
        {full && (
          <SeatMeter
            booked={s.bookedCount}
            capacity={s.capacity}
            label={t('seats')}
            badge={false}
          />
        )}
        <span className={full ? 'mt-1 block text-xs text-fg-muted' : 'block text-sm'}>
          {t('seatsText', { named: s.bookings.length, unnamed: s.unnamedBookings, free })}
          {over > 0 && <span className="text-danger-fg"> · {t('over', { count: over })}</span>}
        </span>
      </DescriptionItem>
      <DescriptionItem label={t('price')}>
        {s.pricePerPerson === null
          ? t('noPrice')
          : t('priceText', {
              price: formatCurrency(s.pricePerPerson),
              total: formatCurrency(s.pricePerPerson * s.bookedCount),
              booked: s.bookedCount,
            })}
      </DescriptionItem>
      <DescriptionItem label={t('status')}>
        <SessionStatusBadge status={s.status} />
      </DescriptionItem>
      {full && <DescriptionItem label={t('id')}>{s.externalId}</DescriptionItem>}
    </DescriptionList>
  )
}

/**
 * Who is booked on a session by name: where each works, how they were booked and when. On the
 * session's page each row can also carry an action (cancelling the booking).
 */
export function SessionAttendees({
  session,
  action,
}: {
  session: SessionListItem
  action?: ((booking: Booking) => ReactNode) | undefined
}) {
  const t = useTranslations('sessions.expanded')
  const tc = useTranslations('common')
  return (
    <Table
      density="compact"
      paging="the people booked on one session: bounded by its seats"
      aria-label={t('people')}
    >
      <THead>
        <tr>
          <Th>{t('person')}</Th>
          <Th>{t('department')}</Th>
          <Th>{t('position')}</Th>
          <Th>{t('via')}</Th>
          <Th>{t('bookedOn')}</Th>
          {action && (
            <Th>
              <span className="sr-only">{tc('actions')}</span>
            </Th>
          )}
        </tr>
      </THead>
      <TBody>
        {session.bookings.map(b => (
          <Tr key={b.person.archived ? b.person.tag : b.person.externalId}>
            <Td>
              <PersonLink person={b.person} />
            </Td>
            <Td>
              <OrgLink kind="departments" id={b.departmentId} name={b.department} />
            </Td>
            <Td>
              <OrgLink kind="positions" id={b.positionId} name={b.position} />
            </Td>
            <Td>
              <Badge tone={b.source === 'ADVISOR' ? 'accent' : 'neutral'}>
                {b.source === 'ADVISOR' ? t('viaAdvisor') : t('viaManual')}
              </Badge>
            </Td>
            <Td nowrap>{formatDate(toZonedParts(b.bookedAt).date)}</Td>
            {action && <Td align="right">{action(b)}</Td>}
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
