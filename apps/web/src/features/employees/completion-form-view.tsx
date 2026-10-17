'use client'

import { todayIn } from '@muni/utils/dates'
import { useTranslations } from 'next-intl'

import { CompletionForm } from '@/components/form/completion-form'
import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
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
  const read = useFormRead('completion-form', { externalId, id })
  const href = `/employees/${externalId}`
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={8} />} entity="employees">
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
