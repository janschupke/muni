import { getEmployeeForEdit, listCourseOptions, listProviderNames } from '@muni/db/repositories'
import { todayIn } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { CompletionForm } from '@/components/form/entity-forms'
import { saveCompletion } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export default async function NewCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  const [employee, courses, providers, t] = await Promise.all([
    getEmployeeForEdit(externalId),
    listCourseOptions(),
    listProviderNames(),
    getTranslations('forms.completion'),
  ])
  if (!employee) notFound()
  const name = `${employee.firstName} ${employee.lastName}`
  return (
    <CompletionForm
      action={saveCompletion.bind(null, externalId, null)}
      cancelHref={`/employees/${externalId}`}
      heading={{
        title: t('title', { name }),
        eyebrow: <BackLink fallback={{ href: `/employees/${externalId}`, label: name }} />,
      }}
      courses={courses}
      providers={providers}
      defaults={{
        courseCode: '',
        completedOn: todayIn(),
        validUntil: null,
        provider: null,
        price: null,
        note: null,
        imported: false,
      }}
    />
  )
}
