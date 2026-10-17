import { getSession, listCourseOptions, listRoomOptions } from '@muni/db/repositories'
import { toZonedParts } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/session-form'
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
  const [session, courses, rooms, t] = await Promise.all([
    getSession(externalId),
    listCourseOptions(),
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
      // A past session of an archived course keeps it (it is not offered to others).
      courses={
        courses.some(c => c.id === session.courseId)
          ? courses
          : [
              ...courses,
              {
                id: session.courseId,
                code: session.courseCode,
                name: session.courseName,
                validityMonths: null,
                needs: {
                  sessionMinutes: null,
                  groupSize: null,
                  onlineAllowed: true,
                  capabilities: [],
                },
              },
            ]
      }
      rooms={rooms}
      self={externalId}
      named={session.assigned.length}
      defaults={{
        courseId: session.courseId,
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        roomId: session.room.id,
        capacity: session.capacity,
        unnamedBookings: session.unnamedBookings,
        pricePerPerson: session.pricePerPerson,
        status: session.status,
      }}
    />
  )
}
