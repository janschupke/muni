'use client'

import { useTranslations } from 'next-intl'

import { CourseForm } from '@/components/form/course-form'
import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveCourse } from '@/server/actions/edit'

/** A new course (no `code`), or one to edit. */
export function CourseFormView({ code }: { code?: string | undefined }) {
  const t = useTranslations()
  const read = useFormRead('course-form', { code })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={8} />} entity="courses">
      {({ course, departments, positions }) =>
        course && code ? (
          <CourseForm
            {...formShell({
              action: saveCourse.bind(null, code),
              back: { href: `/courses/${code}`, label: course.name },
              title: t('forms.course.title', { name: course.name }),
            })}
            defaults={course}
            departments={departments}
            positions={positions}
          />
        ) : (
          <CourseForm
            {...formShell({
              action: saveCourse.bind(null, null),
              back: { href: '/courses', label: t('courses.title') },
              title: t('forms.course.newTitle'),
              isNew: true,
            })}
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
