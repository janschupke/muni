import {
  getCompletionForEdit,
  listCourseOptions,
  listEmployeeOptions,
  listProviderOptions,
} from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { CompletionForm } from '@/components/form/entity-forms'
import { saveCompletion } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export default async function EditCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string; id: string }>
}) {
  await requireAdminPage()
  const { externalId, id } = await params
  const [completion, courses, providers, employees, t] = await Promise.all([
    getCompletionForEdit(id),
    listCourseOptions(),
    listProviderOptions(),
    listEmployeeOptions(),
    getTranslations('forms.completion'),
  ])
  // The address names the person too: a completion of someone else is not found here.
  if (completion?.employee.externalId !== externalId) notFound()
  return (
    <CompletionForm
      action={saveCompletion.bind(null, id)}
      cancelHref={`/employees/${externalId}`}
      heading={{
        title: t('editTitle', { id: completion.externalId, name: completion.employee.name }),
        eyebrow: (
          <BackLink
            fallback={{ href: `/employees/${externalId}`, label: completion.employee.name }}
          />
        ),
      }}
      // Someone who has left is not offered for new records, but keeps their own.
      employees={
        employees.some(e => e.id === completion.employee.id)
          ? employees
          : [...employees, completion.employee]
      }
      // An archived course or provider stays as the record's, shown but not offered to others.
      courses={
        courses.some(c => c.id === completion.course.id) ? courses : [...courses, completion.course]
      }
      providers={
        !completion.provider || providers.some(p => p.id === completion.provider?.id)
          ? providers
          : [...providers, completion.provider]
      }
      defaults={completion}
    />
  )
}
