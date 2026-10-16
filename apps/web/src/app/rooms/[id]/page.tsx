import { getRoom } from '@muni/db/repositories'
import { UTILISATION_DAYS } from '@muni/domain/rooms'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { Meter } from '@muni/ui/meter'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import { History, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { CapabilityList, RoomKindBadge } from '@/components/room-badges'
import { SessionTable } from '@/components/session-table'
import { RoomFitTable } from '@/features/rooms/room-fit-table'
import { getViewer } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

const loadRoom = cache((id: string) => getRoom(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadRoom(id))?.name ?? id }
}

export default async function RoomPage({ params }: Props) {
  const { id } = await params
  const [room, viewer, t, tc, locale] = await Promise.all([
    loadRoom(id),
    getViewer(),
    getTranslations('rooms'),
    getTranslations('common'),
    getLocale(),
  ])
  if (!room) notFound()
  const canEdit = viewer === 'authenticated'
  const seats = room.capacity === null ? t('unlimited') : formatInteger(room.capacity, locale)

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/rooms', label: t('title') }} />}
        title={room.name}
        description={<RoomKindBadge kind={room.kind} />}
        actions={
          canEdit && (
            <Button asChild>
              <Link href={`/rooms/${room.id}/edit`}>
                <Pencil aria-hidden />
                {tc('edit')}
              </Link>
            </Button>
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
              <SessionTable sessions={room.upcoming} canEdit={canEdit} />
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
