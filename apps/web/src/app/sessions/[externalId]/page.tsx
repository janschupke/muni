import { getSession, listEmployeeOptions } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { SplitLayout } from '@muni/ui/layout'
import { Meter } from '@muni/ui/meter'
import { PageHeader } from '@muni/ui/page-header'
import { TextLink } from '@muni/ui/text-link'
import { toZonedParts } from '@muni/utils/dates'
import { formatCurrency, formatDate, formatTimeRange } from '@muni/utils/format'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { PersonLink } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { RecordActions } from '@/components/record-actions'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { RoomLink } from '@/components/session-links'
import { OccupancyBadge, seatTone, SessionStatusBadge } from '@/components/status-badges'
import { AddBookingForm } from '@/features/bookings/add-booking'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ externalId: string }>
}

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
  const user = await requireReader()
  const { externalId } = await params
  const canEdit = canWrite(user.role)
  const [session, t, tb, locale, people] = await Promise.all([
    loadSession(externalId),
    getTranslations('sessions'),
    getTranslations('bookings'),
    getLocale(),
    canEdit ? listEmployeeOptions() : [],
  ])
  if (!session) notFound()
  const booked = new Set(session.assigned.flatMap(a => (a.archived ? [] : [a.externalId])))
  // Booking by hand is for planned sessions that have not started.
  const bookable =
    canEdit && session.status === 'PLANNED' && new Date(session.startsAt) > new Date()

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/sessions', label: t('title') }} />}
        title={session.courseName}
        description={formatTimeRange(session.startsAt, session.endsAt, locale)}
        actions={
          canEdit && (
            <RecordActions
              kind="session"
              id={session.id}
              name={`${session.externalId} · ${session.courseName}`}
              editHref={`/sessions/${session.externalId}/edit`}
              then="/sessions"
            />
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
                  <RoomLink room={session.room} />
                </DescriptionItem>
                <DescriptionItem label={t('detail.status')}>
                  <SessionStatusBadge status={session.status} />
                </DescriptionItem>
                <DescriptionItem label={t('detail.price')}>
                  {formatCurrency(session.pricePerPerson, locale)}
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
            <CardBody className="flex flex-col gap-4">
              {bookable && (
                <AddBookingForm
                  fixed={{ sessionExternalId: session.externalId }}
                  field="employeeExternalId"
                  label={tb('person')}
                  options={people
                    .filter(p => !booked.has(p.externalId))
                    .map(p => ({ value: p.externalId, label: p.name }))}
                />
              )}
              {session.assigned.length === 0 ? (
                <EmptyState variant="inline" title={t('attendees.noneNamed')} />
              ) : (
                <ItemList>
                  {session.assigned.map(a => (
                    <ItemListRow key={a.archived ? a.tag : a.externalId}>
                      <PersonLink person={a} />
                      {canEdit && !a.archived && (
                        <RemoveBookingButton
                          sessionExternalId={session.externalId}
                          employeeExternalId={a.externalId}
                          label={t('attendees.remove', { name: a.name })}
                          confirmTitle={tb('removeConfirm', { name: a.name })}
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
