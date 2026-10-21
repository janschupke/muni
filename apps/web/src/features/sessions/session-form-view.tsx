'use client'

import { toZonedParts } from '@muni/utils/dates'
import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/views/read-view'
import { FormSkeleton, PageLoading } from '@/components/views/skeletons'
import { SessionForm } from '@/features/sessions/session-form'
import { saveSession } from '@/server/actions/edit'
import { saveNewSession } from '@/server/actions/sessions'

import { newSessionDefaults } from './new-session'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <FormSkeleton fields={9} />

/**
 * The session form: a session to edit (`externalId`), a new one of a course (`courseCode`,
 * scheduled from a course, a room or a provider, which `prefill`), or a new one whose course
 * is chosen in the form.
 */
export function SessionFormView({
  externalId,
  courseCode,
  prefill,
}: {
  externalId?: string | undefined
  courseCode?: string | undefined
  prefill?: { room?: string | undefined; provider?: string | undefined } | undefined
}) {
  const t = useTranslations()
  const read = useFormRead('session-form', { externalId })
  return (
    <ReadView query={read} skeleton={SKELETON} entity={courseCode ? 'courses' : 'sessions'}>
      {({ session, courses, rooms }) => {
        if (session) {
          const start = toZonedParts(session.startsAt)
          const end = toZonedParts(session.endsAt)
          const href = `/sessions/${session.externalId}`
          return (
            <SessionForm
              {...formShell({
                action: saveSession.bind(null, session.externalId),
                back: { href, label: session.courseName },
                title: t('sessions.editTitle', {
                  name: `${session.externalId} · ${session.courseName}`,
                }),
                description: `${session.courseCode} · ${session.courseName}`,
              })}
              courses={courses}
              rooms={rooms}
              self={session.externalId}
              named={session.bookings.length}
              defaults={{
                courseId: session.courseId,
                providerId: session.provider.id,
                providerName: session.provider.name,
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
        const course = courseCode ? courses.find(c => c.code === courseCode) : undefined
        return (
          <SessionForm
            {...formShell({
              action: saveNewSession,
              isNew: true,
              ...(course
                ? {
                    back: { href: `/courses/${course.code}`, label: course.name },
                    title: t('courses.newTitle', { course: course.name }),
                  }
                : {
                    back: { href: '/sessions', label: t('sessions.title') },
                    title: t('sessions.newTitle'),
                  }),
            })}
            courses={courses}
            rooms={rooms}
            defaults={newSessionDefaults(course ?? null, prefill)}
          />
        )
      }}
    </ReadView>
  )
}

/** The page until its data is there (its route's `loading.tsx`). */
export function SessionFormLoading() {
  return <PageLoading>{SKELETON}</PageLoading>
}
