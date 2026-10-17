'use client'

import { UTILISATION_DAYS } from '@muni/domain/rooms'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { Meter } from '@muni/ui/meter'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { CapabilityList, RoomKindBadge } from '@/components/room-badges'
import { SessionTable } from '@/components/session-table'
import { DetailSkeleton } from '@/components/skeletons'
import { RoomFitTable } from '@/features/rooms/room-fit-table'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import type { ReadOutput } from '@/server/reads/registry'

export function RoomView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const read = useQuery(readQuery('room', { id }))
  useDocumentTitle(read.data?.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="rooms">
      {data => <RoomDetail data={data} canEdit={canEdit} />}
    </ReadView>
  )
}

function RoomDetail({ data, canEdit }: { data: ReadOutput<'room'>; canEdit: boolean }) {
  const room = data
  const t = useTranslations('rooms')
  const locale = useLocale()
  const seats = room.capacity === null ? t('unlimited') : formatInteger(room.capacity, locale)

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/rooms', label: t('title') }} />}
        title={room.name}
        description={<RoomKindBadge kind={room.kind} />}
        actions={
          canEdit && (
            <RecordActions
              kind="room"
              id={room.id}
              name={room.name}
              editHref={`/rooms/${room.id}/edit`}
              then="/rooms"
            />
          )
        }
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody className="flex flex-col gap-4">
              <DescriptionList>
                <DescriptionItem label={t('detail.capacity')}>{seats}</DescriptionItem>
                <DescriptionItem label={t('detail.capabilities')}>
                  <CapabilityList capabilities={room.capabilities} empty={t('noCapabilities')} />
                </DescriptionItem>
                {room.note && (
                  <DescriptionItem label={t('detail.note')}>{room.note}</DescriptionItem>
                )}
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
        }
        main={
          <>
            <SectionHeading className="mt-0">{t('detail.upcoming')}</SectionHeading>
            {room.upcoming.length === 0 ? (
              <EmptyState variant="inline" title={t('detail.noUpcoming')} />
            ) : (
              <SessionTable
                sessions={room.upcoming}
                canEdit={canEdit}
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
          </>
        }
      />
      <SectionHeading description={t('detail.coursesDescription')}>
        {t('detail.courses')}
      </SectionHeading>
      {room.courses.length === 0 ? (
        <EmptyState variant="inline" title={t('detail.noCourses')} />
      ) : (
        <RoomFitTable room={room} />
      )}
    </>
  )
}
