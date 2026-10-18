import type { CourseListItem } from '@muni/db/repositories'
import { complianceBand, complianceOf } from '@muni/domain/compliance'
import { Badge } from '@muni/ui/badge'
import { HeatCell } from '@muni/ui/charts/heat-cell'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { formatRate } from '@/lib/format-rate'
import { useOfTotal } from '@/lib/use-of-total'

import { CapabilityList } from './room-badges'
import { SeatMeter } from './seat-meter'
import { RoomLink, SessionDateLink } from './session-links'

/** A course row opened: its planned sessions, what a session needs, and who holds it where. */
export function CoursePanel({ course }: { course: CourseListItem }) {
  const t = useTranslations('courses.panel')
  const ts = useTranslations('sessions')
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
                <SeatMeter
                  booked={s.bookedCount}
                  capacity={s.capacity}
                  label={ts('columns.capacity')}
                />
              </ItemListRow>
            ))}
          </ItemList>
        )}
      </DetailPanel>
      <DetailPanel title={t('needs')}>
        <div className="flex flex-col gap-4">
          <CourseNeeds needs={course.sessionNeeds} />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t('offeredBy')}</p>
            <CourseOfferings offerings={course.offerings} />
          </div>
        </div>
      </DetailPanel>
      <DetailPanel title={t('byDepartment')} count={course.byDepartment.length}>
        <CourseByDepartment byDepartment={course.byDepartment} />
      </DetailPanel>
    </DetailGrid>
  )
}

/** What one session of a course needs: its length, group size, whether online, equipment. */
export function CourseNeeds({ needs }: { needs: CourseListItem['sessionNeeds'] }) {
  const t = useTranslations('courses.panel')
  return (
    <DescriptionList>
      <DescriptionItem label={t('length')}>
        {needs.minutes === null ? t('noMinutes') : t('minutes', { minutes: needs.minutes })}
      </DescriptionItem>
      <DescriptionItem label={t('seats')}>
        {needs.seats === null ? t('noGroup') : t('group', { size: needs.seats })}
      </DescriptionItem>
      <DescriptionItem label={t('onlineLabel')}>
        {needs.onlineAllowed ? t('onlineYes') : t('onlineNo')}
      </DescriptionItem>
      <DescriptionItem label={t('equipment')}>
        <CapabilityList capabilities={needs.capabilities} empty={t('noEquipment')} />
      </DescriptionItem>
    </DescriptionList>
  )
}

/** Who offers a course, at what price: each provider linking to its page, the default marked. */
export function CourseOfferings({ offerings }: { offerings: CourseListItem['offerings'] }) {
  const t = useTranslations('courses.panel')
  if (offerings.length === 0) return <EmptyState variant="inline" title={t('noOfferings')} />
  return (
    <ItemList>
      {offerings.map(o => (
        <ItemListRow key={o.providerId}>
          <span className="flex flex-wrap items-center gap-x-2">
            <TextLink asChild hitArea>
              <Link href={`/providers/${o.providerId}`}>{o.providerName}</Link>
            </TextLink>
            {o.isDefault && <Badge tone="neutral">{t('defaultProvider')}</Badge>}
          </span>
          <span className="tabular-nums">{formatCurrency(o.price)}</span>
        </ItemListRow>
      ))}
    </ItemList>
  )
}

/** How much each department holds a course, departments by name as the read sends them. */
export function CourseByDepartment({
  byDepartment,
}: {
  byDepartment: CourseListItem['byDepartment']
}) {
  const t = useTranslations('courses.panel')
  const locale = useLocale()
  const ofTotal = useOfTotal()
  if (byDepartment.length === 0) return <EmptyState variant="inline" title={t('noDepartments')} />
  return (
    <ItemList>
      {byDepartment.map(d => {
        const { held } = complianceOf(d.counts)
        return (
          <ItemListRow key={d.id} className="gap-2">
            <HeatCell
              band={complianceBand(d.rate)}
              tooltip={t('departmentTitle', { department: d.name, held, total: d.counts.total })}
              className="h-6 w-12 min-w-12 flex-none text-xs"
            >
              {formatRate(d.rate, locale)}
            </HeatCell>
            <TextLink asChild>
              <Link href={`/departments/${d.id}`} className="min-w-0 truncate">
                {d.name}
              </Link>
            </TextLink>
            <span className="ml-auto text-xs text-fg-muted tabular-nums">
              {ofTotal(held, d.counts.total)}
            </span>
          </ItemListRow>
        )
      })}
    </ItemList>
  )
}
