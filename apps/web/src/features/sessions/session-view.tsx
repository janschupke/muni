'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { formatTimeRange } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { SessionAttendees, SessionFacts } from '@/components/session-details'
import { DetailSkeleton } from '@/components/skeletons'
import { AddBookingForm } from '@/features/bookings/add-booking'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import { sessionTitle } from '@/lib/titles'
import type { ReadOutput } from '@/server/reads/registry'

/**
 * A session's page: everything its opened row shows (when, the room against what the course
 * needs, seats, price, who is booked and how), with the course, its ID and booking by hand.
 */
export function SessionView({ externalId, canEdit }: { externalId: string; canEdit: boolean }) {
  const locale = useLocale()
  const read = useQuery(readQuery('session', { externalId }))
  const found = read.data?.session
  useDocumentTitle(found && sessionTitle(found, locale))
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
  const attendees = session.bookings.map(b => b.person)
  const booked = new Set(attendees.flatMap(a => (a.archived ? [] : [a.externalId])))
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
            <CardBody>
              <SessionFacts session={session} full />
            </CardBody>
          </Card>
        }
        main={
          <Card>
            <CardHeader
              title={t('attendees.named', { count: attendees.length })}
              description={t('attendees.summary', {
                named: attendees.length,
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
              {attendees.length === 0 ? (
                <EmptyState variant="inline" title={t('attendees.noneNamed')} />
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <SessionAttendees
                    session={session}
                    action={
                      canEdit
                        ? ({ person: a }) =>
                            !a.archived && (
                              <RemoveBookingButton
                                sessionExternalId={session.externalId}
                                employeeExternalId={a.externalId}
                                label={t('attendees.remove', { name: a.name })}
                                confirmTitle={tb('removeConfirm', { name: a.name })}
                              />
                            )
                        : undefined
                    }
                  />
                </div>
              )}
            </CardBody>
          </Card>
        }
      />
    </>
  )
}
