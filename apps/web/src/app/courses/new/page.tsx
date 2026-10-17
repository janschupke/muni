import { listGroupOptions } from '@muni/db/repositories'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { CourseForm } from '@/components/form/entity-forms'
import { saveCourse } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.course'))('newTitle') }
}

export default async function NewCoursePage() {
  await requireAdminPage()
  const [departments, positions, t] = await Promise.all([
    listGroupOptions('department'),
    listGroupOptions('position'),
    getTranslations(),
  ])
  return (
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
