import { getSession } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { SplitLayout } from '@muni/ui/layout'
import { Meter } from '@muni/ui/meter'
import { PageHeader } from '@muni/ui/page-header'
import { TextLink } from '@muni/ui/text-link'
import { toZonedParts } from '@muni/utils/dates'
import { formatCurrency, formatDate, formatOptional, formatTimeRange } from '@muni/utils/format'
import { Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { RoomLink } from '@/components/session-links'
import { OccupancyBadge, seatTone, SessionStatusBadge } from '@/components/status-badges'
import { getViewer } from '@/server/auth'

type Props = { params: Promise<{ externalId: string }> }

const loadSession = cache((externalId: string) => getSession(externalId))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { externalId } = await params
  const [session, locale] = await Promise.all([loadSession(externalId), getLocale()])
  if (!session) return { title: externalId }
  return {
    title: `${session.courseName} · ${formatDate(toZonedParts(session.startsAt).date, locale)}`,
  }
}

export default async function SessionPage({ params }: Props) {
  const { externalId } = await params
  const [session, viewer, t, tc, locale] = await Promise.all([
    loadSession(externalId),
    getViewer(),
    getTranslations('sessions'),
    getTranslations('common'),
    getLocale(),
  ])
  if (!session) notFound()
  const canEdit = viewer === 'authenticated'

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/sessions', label: t('title') }} />}
        title={session.courseName}
        description={formatTimeRange(session.startsAt, session.endsAt, locale)}
        actions={
          canEdit && (
            <Button asChild>
              <Link href={`/sessions/${session.externalId}/edit`}>
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
            <CardHeader title={t('detail.title')} />
            <CardBody className="flex flex-col gap-4">
              <DescriptionList>
                <DescriptionItem label={t('detail.course')}>
                  <TextLink asChild emphasis>
                    <Link href={`/courses/${session.courseCode}`}>{session.courseName}</Link>
                  </TextLink>
                </DescriptionItem>
                <DescriptionItem label={t('detail.when')}>
                  {formatTimeRange(session.startsAt, session.endsAt, locale)}
                </DescriptionItem>
                <DescriptionItem label={t('detail.location')}>
                  <RoomLink location={session.location} isOnline={session.isOnline} />
                </DescriptionItem>
                <DescriptionItem label={t('detail.status')}>
                  <SessionStatusBadge status={session.status} />
                </DescriptionItem>
                <DescriptionItem label={t('detail.price')}>
                  {formatOptional(session.pricePerPerson, v => formatCurrency(v, locale))}
                </DescriptionItem>
                <DescriptionItem label="ID">{session.externalId}</DescriptionItem>
              </DescriptionList>
              <BarRow
                label={t('detail.seats')}
                value={t('booked', { booked: session.bookedCount, capacity: session.capacity })}
                bar={
                  <Meter
                    value={session.bookedCount}
                    max={session.capacity}
                    label={t('detail.seats')}
                    size="md"
                    tone={seatTone(session.bookedCount, session.capacity)}
                  />
                }
              />
              <OccupancyBadge booked={session.bookedCount} capacity={session.capacity} />
            </CardBody>
          </Card>
        }
        main={
          <Card>
            <CardHeader
              title={t('attendees.named', { count: session.assigned.length })}
              description={t('attendees.summary', {
                named: session.assigned.length,
                unnamed: session.unnamedBookings,
              })}
            />
            <CardBody>
              {session.assigned.length === 0 ? (
                <EmptyState variant="inline" title={t('attendees.noneNamed')} />
              ) : (
                <ItemList>
                  {session.assigned.map(a => (
                    <ItemListRow key={a.externalId}>
                      <TextLink asChild>
                        <Link href={`/employees/${a.externalId}`}>{a.name}</Link>
                      </TextLink>
                      {canEdit && (
                        <RemoveBookingButton
                          sessionExternalId={session.externalId}
                          employeeExternalId={a.externalId}
                          label={t('attendees.remove', { name: a.name })}
                        />
                      )}
                    </ItemListRow>
                  ))}
                </ItemList>
              )}
            </CardBody>
          </Card>
        }
      />
    </>
  )
}
