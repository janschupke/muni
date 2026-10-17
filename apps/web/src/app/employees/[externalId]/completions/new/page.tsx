import {
  getEmployeeForEdit,
  listCourseOptions,
  listEmployeeOptions,
  listProviderOptions,
} from '@muni/db/repositories'
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
  const [employee, courses, providers, employees, t] = await Promise.all([
    getEmployeeForEdit(externalId),
    listCourseOptions(),
    listProviderOptions(),
    listEmployeeOptions(),
    getTranslations('forms.completion'),
  ])
  if (!employee) notFound()
  const name = `${employee.firstName} ${employee.lastName}`
  return (
    <CompletionForm
      isNew
      action={saveCompletion.bind(null, null)}
      cancelHref={`/employees/${externalId}`}
      heading={{
        title: t('title', { name }),
        eyebrow: <BackLink fallback={{ href: `/employees/${externalId}`, label: name }} />,
      }}
      employees={
        employees.some(e => e.id === employee.id)
          ? employees
          : [...employees, { id: employee.id, name: `${employee.lastName} ${employee.firstName}` }]
      }
      courses={courses}
      providers={providers}
      defaults={{
        employeeId: employee.id,
        courseId: '',
        completedOn: todayIn(),
        validUntil: null,
        providerId: null,
        price: null,
        note: null,
        imported: false,
      }}
    />
  )
}
