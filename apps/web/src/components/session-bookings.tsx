'use client'

import type { SessionListItem } from '@muni/db/repositories'
import { sessionPhase } from '@muni/domain/sessions'
import { EmptyState } from '@muni/ui/empty-state'
import { formatDate } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { AddBookingForm } from '@/features/bookings/add-booking'
import type { NeedingPerson } from '@/server/reads/sessions'

import { RemoveBookingButton } from './remove-booking-button'
import { SessionAttendees } from './session-details'

/**
 * Who is booked on a session, and for admins the way to change it: the same block on the
 * session's page and in its opened row. While the session is still to start, an admin books
 * someone who needs its course (`needing`; 'loading' while it is read) and cancels a booking
 * from its row.
 */
export function SessionBookings({
  session,
  canEdit,
  needing,
  employee,
}: {
  session: SessionListItem
  canEdit: boolean
  /** Who needs the course, for the booking form; 'loading' while it is read. */
  needing: readonly NeedingPerson[] | 'loading'
  /** Who the form starts with (a session the advisor proposed for them). */
  employee?: string | undefined
}) {
  const t = useTranslations('sessions')
  const tb = useTranslations('bookings')
  const attendees = session.bookings
  // Booking by hand is for planned sessions that have not started.
  const bookable = canEdit && sessionPhase(session, new Date()) === 'AHEAD'
  return (
    <div className="flex flex-col gap-4">
      {bookable && (
        <AddBookingForm
          sessionExternalId={session.externalId}
          initial={employee}
          options={
            needing === 'loading'
              ? 'loading'
              : needing.map(p => ({
                  value: p.externalId,
                  label: tb('needOption', {
                    name: p.name,
                    status: p.status,
                    date: p.validUntil === null ? '' : formatDate(p.validUntil),
                  }),
                }))
          }
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
    </div>
  )
}
