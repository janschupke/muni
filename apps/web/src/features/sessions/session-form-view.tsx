'use client'

import { toZonedParts } from '@muni/utils/dates'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/session-form'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveSession } from '@/server/actions/edit'
import { saveNewSession } from '@/server/actions/sessions'

import { newSessionDefaults } from './new-session'

/**
 * The session form: a session to edit (`externalId`), a new one of a course (`courseCode`,
 * from the course's page), or a new one whose course is chosen in the form.
 */
export function SessionFormView({
  externalId,
  courseCode,
}: {
  externalId?: string | undefined
  courseCode?: string | undefined
}) {
  const t = useTranslations()
  const read = useQuery({
    ...readQuery('session-form', { externalId }),
    ...FORM_READ,
  })
  return (
    <ReadView
      query={read}
      skeleton={<FormSkeleton fields={9} />}
      entity={courseCode ? 'courses' : 'sessions'}
    >
      {({ session, courses, rooms }) => {
        if (session) {
          const start = toZonedParts(session.startsAt)
          const end = toZonedParts(session.endsAt)
          const href = `/sessions/${session.externalId}`
          return (
            <SessionForm
              action={saveSession.bind(null, session.externalId)}
              cancelHref={href}
              heading={{
                title: t('sessions.editTitle', { id: session.externalId }),
                eyebrow: <BackLink fallback={{ href, label: session.courseName }} />,
                description: `${session.courseCode} · ${session.courseName}`,
              }}
              courses={courses}
              rooms={rooms}
              self={session.externalId}
              named={session.bookings.length}
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
        const course = courseCode ? courses.find(c => c.code === courseCode) : undefined
        return (
          <SessionForm
            mode="create"
            action={saveNewSession}
            cancelHref={course ? `/courses/${course.code}` : '/sessions'}
            heading={
              course
                ? {
                    title: t('courses.newTitle', { course: course.name }),
                    eyebrow: (
                      <BackLink
                        fallback={{ href: `/courses/${course.code}`, label: course.name }}
                      />
                    ),
                  }
                : {
                    title: t('sessions.newTitle'),
                    eyebrow: (
                      <BackLink fallback={{ href: '/sessions', label: t('sessions.title') }} />
                    ),
                  }
            }
            courses={courses}
            rooms={rooms}
            defaults={newSessionDefaults(course ?? null)}
          />
        )
      }}
    </ReadView>
  )
}
