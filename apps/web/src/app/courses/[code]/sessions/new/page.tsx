import { listCourseOptions, listRoomOptions } from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/session-form'
import { newSessionDefaults } from '@/features/sessions/new-session'
import { saveNewSession } from '@/server/actions/sessions'
import { requireAdminPage } from '@/server/auth'

export default async function NewSessionPage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage()
  const { code } = await params
  const [courses, rooms, t] = await Promise.all([
    listCourseOptions(),
    listRoomOptions(),
    getTranslations('courses'),
  ])
  const course = courses.find(c => c.code === code)
  if (!course) notFound()
  return (
    <SessionForm
      mode="create"
      action={saveNewSession}
      cancelHref={`/courses/${code}`}
      heading={{
        title: t('newTitle', { course: course.name }),
        eyebrow: <BackLink fallback={{ href: `/courses/${code}`, label: course.name }} />,
      }}
      courses={courses}
      rooms={rooms}
      defaults={newSessionDefaults(course)}
    />
  )
}
