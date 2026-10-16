import { listCourseOptions, listRoomOptions } from '@muni/db/repositories'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/entity-forms'
import { newSessionDefaults } from '@/features/sessions/new-session'
import { saveNewSession } from '@/server/actions/sessions'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sessions'))('newTitle') }
}

/** A new session of a course chosen in the form (from the sessions list). */
export default async function NewSessionPage() {
  await requireAdminPage()
  const [courses, rooms, t] = await Promise.all([
    listCourseOptions(),
    listRoomOptions(),
    getTranslations('sessions'),
  ])
  return (
    <SessionForm
      mode="create"
      action={saveNewSession.bind(null, null)}
      cancelHref="/sessions"
      heading={{
        title: t('newTitle'),
        eyebrow: <BackLink fallback={{ href: '/sessions', label: t('title') }} />,
      }}
      courses={courses}
      rooms={rooms}
      defaults={newSessionDefaults(null)}
    />
  )
}
