'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { SplitLayout } from '@muni/ui/layout'
import { formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { RecordHeader, useRecordRead } from '@/components/record-view'
import { SessionBookings } from '@/components/session-bookings'
import { SessionFacts } from '@/components/session-details'
import { DetailSkeleton } from '@/components/skeletons'
import { sessionTitle } from '@/lib/titles'
import type { ReadOutput } from '@/server/reads/registry'

import { sessionTarget } from './session-target'

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
  const attendees = session.bookings.map(b => b.person)

  return (
    <>
      <RecordHeader
        list={{ href: '/sessions', label: t('title') }}
        title={session.courseName}
        description={formatSessionTime(session)}
        record={canEdit && sessionTarget(session)}
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
            <CardBody>
              <SessionBookings
                session={session}
                canEdit={canEdit}
                needing={needing}
                employee={employee}
              />
            </CardBody>
          </Card>
        }
      />
    </>
  )
}
