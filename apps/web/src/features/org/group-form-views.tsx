'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { DepartmentForm, PositionForm } from '@/components/form/group-forms'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveDepartmentAction, savePositionAction } from '@/server/actions/groups'

/** A department to edit: its name and who leads it. (A new one has no members to choose.) */
export function DepartmentFormView({ id }: { id: string }) {
  const t = useTranslations('departments')
  const read = useFormRead('department-form', { id })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={2} />} entity="departments">
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
    <ReadView query={read} skeleton={<FormSkeleton fields={4} />} entity="positions">
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
