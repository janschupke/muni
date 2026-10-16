import { getSession } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { toZonedParts } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { SessionForm } from '@/components/form/entity-forms'
import { saveSession } from '@/server/actions/edit'
import { requirePageUser } from '@/server/auth'

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requirePageUser()
  const { externalId } = await params
  const [session, t] = await Promise.all([getSession(externalId), getTranslations('sessions')])
  if (!session) notFound()
  const start = toZonedParts(session.startsAt)
  const end = toZonedParts(session.endsAt)
  return (
    <>
      <PageHeader
        title={t('editTitle', { id: externalId })}
        eyebrow={`${session.courseCode} · ${session.courseName}`}
      />
      <SessionForm
        action={saveSession.bind(null, externalId)}
        cancelHref={`/courses/${session.courseCode}`}
        defaults={{
          date: start.date,
          startTime: start.time,
          endTime: end.time,
          location: session.location,
          isOnline: session.isOnline,
          capacity: session.capacity,
          bookedCount: session.bookedCount,
          pricePerPerson: session.pricePerPerson,
          status: session.status,
        }}
      />
    </>
  )
}
