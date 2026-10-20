'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/views/read-view'
import { FormSkeleton } from '@/components/views/skeletons'
import { CourseForm } from '@/features/courses/course-form'
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
              title: t('forms.course.editTitle', { name: course.name }),
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
              seats: null,
              onlineAllowed: false,
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
