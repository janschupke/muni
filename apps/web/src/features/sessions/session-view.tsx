'use client'

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
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { PersonLink } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { RoomLink } from '@/components/session-links'
import { DetailSkeleton } from '@/components/skeletons'
import { OccupancyBadge, seatTone, SessionStatusBadge } from '@/components/status-badges'
import { AddBookingForm } from '@/features/bookings/add-booking'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import type { ReadOutput } from '@/server/reads/registry'

/** A session's page: when and where, its seats, and who is booked. */
export function SessionView({ externalId, canEdit }: { externalId: string; canEdit: boolean }) {
  const locale = useLocale()
  const read = useQuery(readQuery('session', { externalId }))
  const found = read.data?.session
  useDocumentTitle(
    found && `${found.courseName} · ${formatDate(toZonedParts(found.startsAt).date, locale)}`
  )
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="sessions">
      {data => <SessionDetail {...data} canEdit={canEdit} />}
    </ReadView>
  )
}

function SessionDetail({ session, people, canEdit }: ReadOutput<'session'> & { canEdit: boolean }) {
  const t = useTranslations('sessions')
  const tb = useTranslations('bookings')
  const locale = useLocale()
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
