import type { CourseListItem } from '@muni/db/repositories'
import { complianceBand } from '@muni/domain/compliance'
import { HeatCell } from '@muni/ui/charts/heat-cell'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
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
    <DetailGrid layout="thirds">
      <DetailPanel title={t('sessions')} count={course.upcoming.length}>
        {course.upcoming.length === 0 ? (
          <EmptyState variant="inline" title={t('noSessions')} />
        ) : (
          <ItemList>
            {course.upcoming.map(s => (
              <ItemListRow key={s.externalId} className="flex-col items-stretch gap-1">
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
              </ItemListRow>
            ))}
          </ItemList>
        )}
      </DetailPanel>
      <DetailPanel title={t('needs')}>
        <DescriptionList>
          <DescriptionItem label={t('length')}>
            {needs.minutes === null ? t('noMinutes') : t('minutes', { minutes: needs.minutes })}
          </DescriptionItem>
          <DescriptionItem label={t('groupSize')}>
            {needs.groupSize === null ? t('noGroup') : t('group', { size: needs.groupSize })}
          </DescriptionItem>
          <DescriptionItem label={t('onlineLabel')}>
            {needs.onlineAllowed ? t('onlineYes') : t('onlineNo')}
          </DescriptionItem>
          <DescriptionItem label={t('equipment')}>
            <CapabilityList capabilities={needs.capabilities} empty={t('noEquipment')} />
          </DescriptionItem>
        </DescriptionList>
      </DetailPanel>
      <DetailPanel title={t('byDepartment')} count={course.byDepartment.length}>
        {course.byDepartment.length === 0 ? (
          <EmptyState variant="inline" title={t('noDepartments')} />
        ) : (
          <ItemList>
            {course.byDepartment.map(d => {
              const held = d.counts.VALID + d.counts.EXPIRING
              return (
                <ItemListRow key={d.id} className="gap-2">
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
                    <Link href={`/departments/${d.id}`} className="min-w-0 truncate">
                      {d.name}
                    </Link>
                  </TextLink>
                  <span className="ml-auto text-xs text-fg-muted tabular-nums">
                    {formatInteger(held, locale)}/{formatInteger(d.counts.total, locale)}
                  </span>
                </ItemListRow>
              )
            })}
          </ItemList>
        )}
      </DetailPanel>
    </DetailGrid>
  )
}
