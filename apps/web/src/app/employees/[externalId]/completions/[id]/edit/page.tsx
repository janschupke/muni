import { getCompletionForEdit, listCourseOptions, listProviderNames } from '@muni/db/repositories'
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
  const [completion, courses, providers, t] = await Promise.all([
    getCompletionForEdit(id),
    listCourseOptions(),
    listProviderNames(),
    getTranslations('forms.completion'),
  ])
  // The address names the person too: a completion of someone else is not found here.
  if (completion?.employee.externalId !== externalId) notFound()
  return (
    <CompletionForm
      action={saveCompletion.bind(null, externalId, id)}
      cancelHref={`/employees/${externalId}`}
      heading={{
        title: t('editTitle', { id: completion.externalId, name: completion.employee.name }),
        eyebrow: (
          <BackLink
            fallback={{ href: `/employees/${externalId}`, label: completion.employee.name }}
          />
        ),
      }}
      courses={courses}
      providers={providers}
      defaults={completion}
    />
  )
}
