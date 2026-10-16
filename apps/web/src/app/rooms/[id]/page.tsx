import { getRoom } from '@muni/db/repositories'
import { UTILISATION_DAYS } from '@muni/domain/rooms'
import { Badge } from '@muni/ui/badge'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { SplitLayout } from '@muni/ui/layout'
import { Meter } from '@muni/ui/meter'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import { CircleCheck, History, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { CapabilityList, RoomKindBadge } from '@/components/room-badges'
import { SessionTable } from '@/components/session-table'
import { getViewer } from '@/server/auth'

type Props = { params: Promise<{ id: string }> }

const loadRoom = cache((id: string) => getRoom(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadRoom(id))?.name ?? id }
}

export default async function RoomPage({ params }: Props) {
  const { id } = await params
  const [room, viewer, t, tc, tcap, locale] = await Promise.all([
    loadRoom(id),
    getViewer(),
    getTranslations('rooms'),
    getTranslations('common'),
    getTranslations('status.capability'),
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
          <div className="flex flex-col gap-6">
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
            <Card>
              <CardHeader
                title={t('detail.courses')}
                description={t('detail.coursesDescription')}
              />
              <CardBody>
                {room.courses.length === 0 ? (
                  <EmptyState variant="inline" title={t('detail.noCourses')} />
                ) : (
                  <ItemList>
                    {room.courses.map(c => (
                      <ItemListRow key={c.code}>
                        <TextLink asChild>
                          <Link href={`/courses/${c.code}`}>{c.name}</Link>
                        </TextLink>
                        {c.mismatch === null ? (
                          <Badge tone="success">
                            <CircleCheck aria-hidden />
                            {t('detail.fits')}
                          </Badge>
                        ) : (
                          <span className="text-xs text-fg-muted">
                            {c.mismatch.kind === 'MISSING_CAPABILITIES'
                              ? t('detail.mismatch.MISSING_CAPABILITIES', {
                                  missing: c.mismatch.missing.map(m => tcap(m)).join(', '),
                                })
                              : c.mismatch.kind === 'TOO_SMALL'
                                ? t('detail.mismatch.TOO_SMALL', { capacity: c.mismatch.capacity })
                                : t('detail.mismatch.ONLINE_NOT_ALLOWED')}
                          </span>
                        )}
                      </ItemListRow>
                    ))}
                  </ItemList>
                )}
              </CardBody>
            </Card>
          </div>
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
    </>
  )
}
