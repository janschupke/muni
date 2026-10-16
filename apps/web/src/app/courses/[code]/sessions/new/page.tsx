import { getCourseForEdit, listRoomOptions } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { addDays, todayIn, toZonedParts, zonedTimeToUtc } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/entity-forms'
import { saveNewSession } from '@/server/actions/sessions'
import { requirePageUser } from '@/server/auth'

const START = '09:00'

export default async function NewSessionPage({ params }: { params: Promise<{ code: string }> }) {
  await requirePageUser()
  const { code } = await params
  const [course, rooms, t] = await Promise.all([
    getCourseForEdit(code),
    listRoomOptions(),
    getTranslations('courses'),
  ])
  if (!course) notFound()
  // Tomorrow at nine, for the course's usual length and group.
  const date = addDays(todayIn(), 1)
  const ends = new Date(
    zonedTimeToUtc(date, START).getTime() + (course.sessionMinutes ?? 180) * 60_000
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
          startTime: START,
          endTime: toZonedParts(ends).time,
          roomId: '',
          capacity: course.groupSize ?? 0,
          unnamedBookings: 0,
          assignedCount: 0,
          pricePerPerson: null,
          status: 'PLANNED',
        }}
      />
    </>
  )
}
