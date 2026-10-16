import { getCourseForEdit, listRoomOptions } from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/entity-forms'
import { newSessionDefaults } from '@/features/sessions/new-session'
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
  return (
    <SessionForm
      mode="create"
      action={saveNewSession.bind(null, code)}
      cancelHref={`/courses/${code}`}
      heading={{
        title: t('newTitle', { course: course.name }),
        eyebrow: <BackLink fallback={{ href: `/courses/${code}`, label: course.name }} />,
      }}
      rooms={rooms}
      defaults={newSessionDefaults(course)}
    />
  )
}
