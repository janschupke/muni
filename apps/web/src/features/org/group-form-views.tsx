'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/views/read-view'
import { FormSkeleton, PageLoading } from '@/components/views/skeletons'
import { DepartmentForm, PositionForm } from '@/features/org/group-forms'
import { saveDepartmentAction, savePositionAction } from '@/server/actions/groups'

// What the page shows until its data is there, here and as its route's loading state.
const DEPARTMENT_SKELETON = <FormSkeleton fields={2} />
const POSITION_SKELETON = <FormSkeleton fields={4} />

/** A department to edit: its name and who leads it. (A new one has no members to choose.) */
export function DepartmentFormView({ id }: { id: string }) {
  const t = useTranslations('departments')
  const read = useFormRead('department-form', { id })
  return (
    <ReadView query={read} skeleton={DEPARTMENT_SKELETON} entity="departments">
      {group => (
        <DepartmentForm
          {...formShell({
            action: saveDepartmentAction.bind(null, id),
            back: { href: `/departments/${id}`, label: group.name },
            title: t('editTitle', { name: group.name }),
          })}
          defaults={group}
          members={group.members}
        />
      )}
    </ReadView>
  )
}

/** A new position (no `id`), or one to edit: its name and the departments it is in. */
export function PositionFormView({ id }: { id?: string | undefined }) {
  const t = useTranslations('positions')
  const read = useFormRead('position-form', { id })
  return (
    <ReadView query={read} skeleton={POSITION_SKELETON} entity="positions">
      {({ position, departments }) =>
        position && id ? (
          <PositionForm
            {...formShell({
              action: savePositionAction.bind(null, id),
              back: { href: `/positions/${id}`, label: position.name },
              title: t('editTitle', { name: position.name }),
            })}
            defaults={position}
            departments={departments}
          />
        ) : (
          <PositionForm
            {...formShell({
              action: savePositionAction.bind(null, null),
              back: { href: '/positions', label: t('title') },
              title: t('newTitle'),
              isNew: true,
            })}
            defaults={{ name: '', departmentIds: [] }}
            departments={departments}
          />
        )
      }
    </ReadView>
  )
}

/** A department's form until its data is there (its routes' `loading.tsx`). */
export function DepartmentFormLoading() {
  return <PageLoading>{DEPARTMENT_SKELETON}</PageLoading>
}

/** A position's form until its data is there (its routes' `loading.tsx`). */
export function PositionFormLoading() {
  return <PageLoading>{POSITION_SKELETON}</PageLoading>
}
