import { getEmployeeForEdit, listCourseOptions, listProviderNames } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { todayIn } from '@muni/utils/dates'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { CompletionForm } from '@/components/form/entity-forms'
import { recordCompletion } from '@/server/actions/edit'
import { requirePageUser } from '@/server/auth'

export default async function NewCompletionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requirePageUser()
  const { externalId } = await params
  const [employee, courses, providers, t] = await Promise.all([
    getEmployeeForEdit(externalId),
    listCourseOptions(),
    listProviderNames(),
    getTranslations('forms.completion'),
  ])
  if (!employee) notFound()
  return (
    <>
      <PageHeader
        title={t('title', { name: `${employee.firstName} ${employee.lastName}` })}
        eyebrow={
          <BackLink
            fallback={{
              href: `/employees/${externalId}`,
              label: `${employee.firstName} ${employee.lastName}`,
            }}
          />
        }
      />
      <CompletionForm
        action={recordCompletion.bind(null, externalId)}
        cancelHref={`/employees/${externalId}`}
        courses={courses}
        providers={providers}
        today={todayIn()}
      />
    </>
  )
}
