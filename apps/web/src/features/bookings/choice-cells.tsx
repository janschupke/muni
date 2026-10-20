'use client'

import type { PlanItem, SessionChoice } from '@muni/domain/advisor'
import type { RoomRef } from '@muni/domain/rooms'
import { Badge } from '@muni/ui/badge'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { RoomLink, SessionDateLink } from '@/features/sessions/session-links'

/** A new session of the training's course: its form returns to the page that asked. */
export const scheduleHref = (item: PlanItem) => `/courses/${item.need.course.code}/sessions/new`

/** A session as "date (link) / room (link)". */
export function SessionCell({
  session,
  employee,
}: {
  session: { externalId: string; startsAt: string; endsAt: string; room: RoomRef }
  /** The person the session is proposed for: its page offers them for booking. */
  employee?: string | undefined
}) {
  return (
    <CellStack
      title={<SessionDateLink session={session} employee={employee} emphasis />}
      meta={<RoomLink room={session.room} />}
    />
  )
}

/** Under a session: how full it is, and whether it ends before the training lapses. */
export function ChoiceFacts({ choice, asOf }: { choice: SessionChoice; asOf: string }) {
  const t = useTranslations('bookings')
  const { session, window } = choice
  return (
    <>
      <span className="text-xs text-fg-subtle tabular-nums">
        {t('fill', {
          booked: session.unnamedBookings + session.assigned.length,
          capacity: session.capacity,
        })}
      </span>
      {window === null ? (
        <span className="text-xs text-fg-muted">{t('inTime')}</span>
      ) : (
        <span className="text-xs text-warning-fg">
          {window.from !== null && window.from > asOf && window.days !== null
            ? t('gap', { days: window.days })
            : window.until !== null && t('coveredOn', { until: formatDate(window.until) })}
        </span>
      )}
    </>
  )
}

/**
 * A training no session can take: why, and what to do about it (schedule a session of the
 * course; for a clash, look at the person's bookings).
 */
export function UnplacedCell({ item }: { item: PlanItem }) {
  const t = useTranslations('bookings')
  const { proposal } = item
  if (proposal?.kind !== 'NONE') return null
  const todo =
    proposal.reason === 'CONFLICT'
      ? { href: `/employees/${item.need.employee.externalId}`, label: t('todo.bookings') }
      : { href: scheduleHref(item), label: t('todo.schedule') }
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone="neutral">{t(`reasons.${proposal.reason}`)}</Badge>
      <TextLink asChild className="text-xs" arrow hitArea>
        <Link href={todo.href}>{todo.label}</Link>
      </TextLink>
    </div>
  )
}
