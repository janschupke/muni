'use client'

import { UTILISATION_DAYS } from '@muni/domain/rooms'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import type { TablePaging } from '@muni/ui/data-table'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { Meter } from '@muni/ui/meter'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import { History } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { RecordHeader, useRecordRead } from '@/components/record-view'
import { CapabilityList, RoomKindBadge } from '@/components/room-badges'
import { SessionTable } from '@/components/session-table'
import { DetailSkeleton } from '@/components/skeletons'
import { RoomFitTable } from '@/features/rooms/room-fit-table'
import { SESSION_SORT } from '@/lib/list-keys'
import { type PageInfo, useListUrl } from '@/lib/use-list-url'
import type { ReadOutput } from '@/server/reads/registry'

/** A room's page: what it holds and has, a page of its sessions ahead, the courses it fits. */
export function RoomView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const sessions = useListUrl(SESSION_SORT, { id: 'date', desc: false }, 'sessions')
  const read = useRecordRead('room', { id, ...sessions.input }, room => room.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="rooms">
      {data => <RoomDetail data={data} canEdit={canEdit} paging={sessions.paging} />}
    </ReadView>
  )
}

function RoomDetail({
  data,
  canEdit,
  paging,
}: {
  data: ReadOutput<'room'>
  canEdit: boolean
  paging: (page: PageInfo) => TablePaging
}) {
  const room = data
  const t = useTranslations('rooms')
  const locale = useLocale()
  const seats = room.capacity === null ? t('unlimited') : formatInteger(room.capacity, locale)

  return (
    <>
      <RecordHeader
        list={{ href: '/rooms', label: t('title') }}
        title={room.name}
        description={<RoomKindBadge kind={room.kind} />}
        record={
          canEdit && {
            kind: 'room',
            id: room.id,
            name: room.name,
            editHref: `/rooms/${room.id}/edit`,
          }
        }
      />
      {/* Its facts across the page, so its sessions get the full width as on a course's page. */}
      <Card>
        <CardHeader title={t('detail.facts')} />
        <CardBody className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <DescriptionList>
            <DescriptionItem label={t('detail.capacity')}>{seats}</DescriptionItem>
            <DescriptionItem label={t('detail.capabilities')}>
              <CapabilityList capabilities={room.capabilities} empty={t('noCapabilities')} />
            </DescriptionItem>
            {room.note && <DescriptionItem label={t('detail.note')}>{room.note}</DescriptionItem>}
          </DescriptionList>
          {room.utilisation !== null && (
            <BarRow
              label={t('detail.utilisation', { days: UTILISATION_DAYS })}
              value={t('utilisationOf', { share: formatPercent(room.utilisation, locale) })}
              bar={
                <Meter
                  value={Math.round(room.utilisation * 100)}
                  max={100}
                  label={t('detail.utilisation', { days: UTILISATION_DAYS })}
                  size="md"
                />
              }
            />
          )}
        </CardBody>
      </Card>
      <SectionHeading>{t('detail.upcoming')}</SectionHeading>
      {room.upcoming.total === 0 ? (
        <EmptyState title={t('detail.noUpcoming')} />
      ) : (
        <SessionTable
          sessions={room.upcoming.items}
          paging={paging(room.upcoming)}
          canEdit={canEdit}
          showRoom={false}
          caption={t('detail.upcoming')}
          panelLevel={3}
        />
      )}
      {room.pastCount > 0 && (
        <p className="mt-3 text-sm">
          <TextLink asChild>
            <Link
              href={`/sessions?when=past&room=${encodeURIComponent(room.id)}`}
              className="inline-flex items-center gap-1.5"
            >
              <History aria-hidden className="size-4" />
              {t('detail.past', { count: room.pastCount })}
            </Link>
          </TextLink>
        </p>
      )}
      <SectionHeading description={t('detail.coursesDescription')}>
        {t('detail.courses')}
      </SectionHeading>
      {room.courses.length === 0 ? (
        <EmptyState variant="inline" title={t('detail.noCourses')} />
      ) : (
        <RoomFitTable room={room} canEdit={canEdit} />
      )}
    </>
  )
}
