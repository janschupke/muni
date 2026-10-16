import type { SessionListItem } from '@muni/db/repositories'
import { Meter } from '@muni/ui/meter'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { APP_TIME_ZONE } from '@muni/utils/dates'
import { formatCzk, formatDateTime, formatTime } from '@muni/utils/format'
import { Pencil, Wifi } from 'lucide-react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { SessionStatusBadge } from './status-badges'

export async function SessionTable({
  sessions,
  canEdit,
  showCourse = true,
  compact = false,
}: {
  sessions: SessionListItem[]
  canEdit: boolean
  showCourse?: boolean
  /** Course, time and occupancy only (dashboard). */
  compact?: boolean
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations('sessions'),
    getTranslations('common'),
    getLocale(),
  ])
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            {showCourse && <Th>{t('columns.course')}</Th>}
            <Th>{t('columns.date')}</Th>
            {!compact && <Th>{t('columns.location')}</Th>}
            <Th className="w-48">{t('columns.capacity')}</Th>
            {!compact && <Th className="text-right">{t('columns.price')}</Th>}
            {!compact && <Th>{t('columns.status')}</Th>}
            {canEdit && !compact && (
              <Th className="w-0">
                <span className="sr-only">{tc('edit')}</span>
              </Th>
            )}
          </tr>
        </THead>
        <TBody>
          {sessions.map(s => {
            const over = s.bookedCount > s.capacity
            const full = !over && s.capacity > 0 && s.bookedCount === s.capacity
            return (
              <Tr
                key={s.externalId}
                className={s.status === 'CANCELLED' ? 'text-fg-subtle' : undefined}
              >
                {showCourse && (
                  <Td>
                    <Link href={`/courses/${s.courseCode}`} className="font-medium hover:underline">
                      {s.courseName}
                    </Link>
                    <div className="text-xs text-fg-subtle">
                      {s.courseCode} · {s.externalId}
                    </div>
                  </Td>
                )}
                <Td className="whitespace-nowrap">
                  {`${formatDateTime(s.startsAt, locale, APP_TIME_ZONE)}–${formatTime(s.endsAt, locale, APP_TIME_ZONE)}`}
                </Td>
                {!compact && (
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      {s.isOnline && (
                        <Wifi aria-label={tc('online')} className="size-3.5 text-fg-muted" />
                      )}
                      {s.location}
                    </span>
                  </Td>
                )}
                <Td>
                  <div className="flex items-center gap-2">
                    <Meter
                      value={s.bookedCount}
                      max={s.capacity}
                      label={t('columns.capacity')}
                      className="w-20"
                    />
                    <span className="text-xs whitespace-nowrap tabular-nums">
                      {t('booked', { booked: s.bookedCount, capacity: s.capacity })}
                    </span>
                    {over && (
                      <span className="text-xs font-medium text-danger-fg">{t('overbooked')}</span>
                    )}
                    {full && <span className="text-xs text-fg-muted">{t('full')}</span>}
                  </div>
                </Td>
                {!compact && (
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {s.pricePerPerson === null ? tc('notSet') : formatCzk(s.pricePerPerson, locale)}
                  </Td>
                )}
                {!compact && (
                  <Td>
                    <SessionStatusBadge status={s.status} />
                  </Td>
                )}
                {canEdit && !compact && (
                  <Td>
                    <Link
                      href={`/sessions/${s.externalId}/edit`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-state-hover hover:text-fg"
                      aria-label={t('editTitle', { id: s.externalId })}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Link>
                  </Td>
                )}
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </TableContainer>
  )
}
