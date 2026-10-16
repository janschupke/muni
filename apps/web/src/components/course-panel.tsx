import type { CourseListItem } from '@muni/db/repositories'
import { complianceBand } from '@muni/domain/compliance'
import { HeatCell } from '@muni/ui/charts/heat-cell'
import { Meter } from '@muni/ui/meter'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { CapabilityList } from './room-badges'
import { RoomLink, SessionDateLink } from './session-links'
import { OccupancyBadge, seatTone } from './status-badges'

/** A course row opened: its planned sessions, what a session needs, and who holds it where. */
export function CoursePanel({ course }: { course: CourseListItem }) {
  const t = useTranslations('courses.panel')
  const ts = useTranslations('sessions')
  const locale = useLocale()
  const { sessionNeeds: needs } = course
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div role="group" aria-label={t('sessions')} className="flex flex-col gap-2">
        <p className="text-xs font-medium text-fg-muted">{t('sessions')}</p>
        {course.upcoming.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t('noSessions')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {course.upcoming.map(s => (
              <li key={s.externalId} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <SessionDateLink session={s} emphasis />
                  <span className="text-fg-subtle">·</span>
                  <RoomLink room={s.room} />
                </span>
                <span className="flex items-center gap-2">
                  <Meter
                    value={s.bookedCount}
                    max={s.capacity}
                    label={ts('columns.capacity')}
                    tone={seatTone(s.bookedCount, s.capacity)}
                    className="w-24"
                  />
                  <span className="text-xs text-fg-muted tabular-nums">
                    {ts('booked', { booked: s.bookedCount, capacity: s.capacity })}
                  </span>
                  <OccupancyBadge booked={s.bookedCount} capacity={s.capacity} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div role="group" aria-label={t('needs')} className="flex flex-col gap-2 text-sm">
        <p className="text-xs font-medium text-fg-muted">{t('needs')}</p>
        <p>
          {[
            needs.minutes === null ? t('noMinutes') : t('minutes', { minutes: needs.minutes }),
            needs.groupSize === null ? t('noGroup') : t('group', { size: needs.groupSize }),
            ...(needs.onlineAllowed ? [t('online')] : []),
          ].join(' · ')}
        </p>
        <CapabilityList capabilities={needs.capabilities} />
      </div>
      <div role="group" aria-label={t('byDepartment')} className="flex flex-col gap-2">
        <p className="text-xs font-medium text-fg-muted">{t('byDepartment')}</p>
        {course.byDepartment.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t('noDepartments')}</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {course.byDepartment.map(d => {
              const held = d.counts.VALID + d.counts.EXPIRING
              return (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <HeatCell
                    band={complianceBand(d.rate)}
                    tooltip={t('departmentTitle', {
                      department: d.name,
                      held,
                      total: d.counts.total,
                    })}
                    className="h-6 w-12 min-w-12 flex-none text-xs"
                  >
                    {formatPercent(d.rate, locale)}
                  </HeatCell>
                  <TextLink asChild>
                    <Link href={`/departments/${d.id}`} className="truncate">
                      {d.name}
                    </Link>
                  </TextLink>
                  <span className="ml-auto text-xs text-fg-muted tabular-nums">
                    {formatInteger(held, locale)}/{formatInteger(d.counts.total, locale)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
