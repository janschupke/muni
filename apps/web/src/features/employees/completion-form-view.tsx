'use client'

import { todayIn } from '@muni/utils/dates'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { CompletionForm } from '@/components/form/entity-forms'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveCompletion } from '@/server/actions/edit'

/** A new completion for a person (no `id`), or one of theirs to correct. */
export function CompletionFormView({
  externalId,
  id,
}: {
  externalId: string
  id?: string | undefined
}) {
  const t = useTranslations('forms.completion')
  const read = useQuery({
    ...readQuery('completion-form', { externalId, id }),
    ...FORM_READ,
  })
  const href = `/employees/${externalId}`
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={8} />} entity="employees">
      {({ person, completion, employees, courses, providers }) =>
        completion ? (
          <CompletionForm
            action={saveCompletion.bind(null, completion.id)}
            cancelHref={href}
            heading={{
              title: t('editTitle', { id: completion.externalId, name: completion.employee.name }),
              eyebrow: <BackLink fallback={{ href, label: completion.employee.name }} />,
            }}
            employees={employees}
            courses={courses}
            providers={providers}
            defaults={completion}
          />
        ) : (
          <CompletionForm
            isNew
            action={saveCompletion.bind(null, null)}
            cancelHref={href}
            heading={{
              title: t('title', { name: person.name }),
              eyebrow: <BackLink fallback={{ href, label: person.name }} />,
            }}
            employees={employees}
            courses={courses}
            providers={providers}
            defaults={{
              employeeId: person.id,
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
    </ReadView>
  )
}
