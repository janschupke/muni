'use client'

import { todayIn } from '@muni/utils/dates'
import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/views/read-view'
import { FormSkeleton, PageLoading } from '@/components/views/skeletons'
import { CompletionForm } from '@/features/employees/completion-form'
import { saveCompletion } from '@/server/actions/edit'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <FormSkeleton fields={8} />

/** A new completion for a person (no `id`), or one of theirs to correct. */
export function CompletionFormView({
  externalId,
  id,
}: {
  externalId: string
  id?: string | undefined
}) {
  const t = useTranslations('forms.completion')
  const read = useFormRead('completion-form', { externalId, id })
  const href = `/employees/${externalId}`
  return (
    <ReadView query={read} skeleton={SKELETON} entity="employees">
      {({ person, completion, employees, courses, providers }) =>
        completion ? (
          <CompletionForm
            {...formShell({
              action: saveCompletion.bind(null, completion.id),
              back: { href, label: completion.employee.name },
              title: t('editTitle', { id: completion.externalId, name: completion.employee.name }),
            })}
            employees={employees}
            courses={courses}
            providers={providers}
            defaults={completion}
          />
        ) : (
          <CompletionForm
            {...formShell({
              action: saveCompletion.bind(null, null),
              back: { href, label: person.name },
              title: t('title', { name: person.name }),
              isNew: true,
            })}
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

/** The page until its data is there (its route's `loading.tsx`). */
export function CompletionFormLoading() {
  return <PageLoading>{SKELETON}</PageLoading>
}
