'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { CourseForm } from '@/components/form/course-form'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveCourse } from '@/server/actions/edit'

/** A new course (no `code`), or one to edit. */
export function CourseFormView({ code }: { code?: string | undefined }) {
  const t = useTranslations()
  const read = useQuery({ ...readQuery('course-form', { code }), ...FORM_READ })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={8} />} entity="courses">
      {({ course, departments, positions }) =>
        course && code ? (
          <CourseForm
            action={saveCourse.bind(null, code)}
            cancelHref={`/courses/${code}`}
            heading={{
              title: t('forms.course.title', { code }),
              eyebrow: <BackLink fallback={{ href: `/courses/${code}`, label: course.name }} />,
            }}
            defaults={course}
            departments={departments}
            positions={positions}
          />
        ) : (
          <CourseForm
            isNew
            action={saveCourse.bind(null, null)}
            cancelHref="/courses"
            heading={{
              title: t('forms.course.newTitle'),
              eyebrow: <BackLink fallback={{ href: '/courses', label: t('courses.title') }} />,
            }}
            defaults={{
              name: '',
              validityMonths: null,
              requiredForAll: false,
              departmentIds: [],
              positionIds: [],
              sessionMinutes: null,
              groupSize: null,
              onlineAllowed: null,
              derived: { sessionMinutes: null, groupSize: null, onlineAllowed: false },
              capabilities: [],
            }}
            departments={departments}
            positions={positions}
          />
        )
      }
    </ReadView>
  )
}
