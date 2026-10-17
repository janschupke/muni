'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { formatDate, formatTimeRange } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { RecordHeader, useRecordRead } from '@/components/record-view'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { SessionAttendees, SessionFacts } from '@/components/session-details'
import { DetailSkeleton } from '@/components/skeletons'
import { AddBookingForm } from '@/features/bookings/add-booking'
import { sessionTitle } from '@/lib/titles'
import type { ReadOutput } from '@/server/reads/registry'

/**
 * A session's page: everything its opened row shows (when, the room against what the course
 * needs, seats, price, who is booked and how), with the course, its ID and booking by hand.
 */
export function SessionView({
  externalId,
  canEdit,
  employee,
}: {
  externalId: string
  canEdit: boolean
  /** The person the booking form starts with (from the advisor's link). */
  employee?: string | undefined
}) {
  const read = useRecordRead('session', { externalId }, data => sessionTitle(data.session))
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="sessions">
      {data => <SessionDetail {...data} canEdit={canEdit} employee={employee} />}
    </ReadView>
  )
}

function SessionDetail({
  session,
  needing,
  canEdit,
  employee,
}: ReadOutput<'session'> & { canEdit: boolean; employee?: string | undefined }) {
  const t = useTranslations('sessions')
  const tb = useTranslations('bookings')
  const attendees = session.bookings.map(b => b.person)
  // Booking by hand is for planned sessions that have not started.
  const bookable =
    canEdit && session.status === 'PLANNED' && new Date(session.startsAt) > new Date()

  return (
    <>
      <RecordHeader
        list={{ href: '/sessions', label: t('title') }}
        title={session.courseName}
        description={formatTimeRange(session.startsAt, session.endsAt)}
        record={
          canEdit && {
            kind: 'session',
            id: session.id,
            name: `${session.externalId} · ${session.courseName}`,
            editHref: `/sessions/${session.externalId}/edit`,
          }
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
                  sessionExternalId={session.externalId}
                  initial={employee}
                  options={needing.map(p => ({
                    value: p.externalId,
                    label: tb('needOption', {
                      name: p.name,
                      status: p.status,
                      date: p.validUntil === null ? '' : formatDate(p.validUntil),
                    }),
                  }))}
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
