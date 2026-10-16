import { getCourseForEdit, listRoomOptions } from '@muni/db/repositories'
import { DEFAULT_SESSION_MINUTES, DEFAULT_START } from '@muni/domain/planner'
import { PageHeader } from '@muni/ui/page-header'
import { addDays, todayIn, toZonedParts, zonedTimeToUtc } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/entity-forms'
import { saveNewSession } from '@/server/actions/sessions'
import { requireAdminPage } from '@/server/auth'

export default async function NewSessionPage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage()
  const { code } = await params
  const [course, rooms, t] = await Promise.all([
    getCourseForEdit(code),
    listRoomOptions(),
    getTranslations('courses'),
  ])
  if (!course) notFound()
  // Tomorrow at the planner's default start, for the course's usual length and group. A
  // course's length is at most 12 hours, so the session ends the same day.
  const date = addDays(todayIn(), 1)
  const ends = new Date(
    zonedTimeToUtc(date, DEFAULT_START).getTime() +
      (course.sessionMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000
  )
  return (
    <>
      <PageHeader
        title={t('newTitle', { course: course.name })}
        eyebrow={<BackLink fallback={{ href: `/courses/${code}`, label: course.name }} />}
      />
      <SessionForm
        mode="create"
        action={saveNewSession.bind(null, code)}
        cancelHref={`/courses/${code}`}
        rooms={rooms}
        defaults={{
          date,
          startTime: DEFAULT_START,
          endTime: toZonedParts(ends).time,
          roomId: '',
          capacity: course.groupSize,
          unnamedBookings: 0,
          assignedCount: 0,
          pricePerPerson: null,
          status: 'PLANNED',
        }}
      />
    </>
  )
}
