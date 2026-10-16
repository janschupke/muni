import { getSession, listRoomOptions } from '@muni/db/repositories'
import { toZonedParts } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/entity-forms'
import { saveSession } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

/** Named attendees are added and removed on the session's page; the form edits the rest. */
export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  const [session, rooms, t] = await Promise.all([
    getSession(externalId),
    listRoomOptions(),
    getTranslations('sessions'),
  ])
  if (!session) notFound()
  const start = toZonedParts(session.startsAt)
  const end = toZonedParts(session.endsAt)
  return (
    <SessionForm
      action={saveSession.bind(null, externalId)}
      cancelHref={`/sessions/${externalId}`}
      heading={{
        title: t('editTitle', { id: externalId }),
        eyebrow: (
          <BackLink fallback={{ href: `/sessions/${externalId}`, label: session.courseName }} />
        ),
        description: `${session.courseCode} · ${session.courseName}`,
      }}
      rooms={rooms}
      defaults={{
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        roomId: session.room.id,
        capacity: session.capacity,
        unnamedBookings: session.unnamedBookings,
        assignedCount: session.assigned.length,
        pricePerPerson: session.pricePerPerson,
        status: session.status,
      }}
    />
  )
}
