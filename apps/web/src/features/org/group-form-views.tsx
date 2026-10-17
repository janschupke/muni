'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { DepartmentForm, PositionForm } from '@/components/form/entity-forms'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveDepartmentAction, savePositionAction } from '@/server/actions/groups'

/** A department to edit: its name and who leads it. (A new one has no members to choose.) */
export function DepartmentFormView({ id }: { id: string }) {
  const t = useTranslations('departments')
  const read = useQuery({ ...readQuery('department-form', { id }), ...FORM_READ })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={2} />} entity="departments">
      {group => (
        <DepartmentForm
          action={saveDepartmentAction.bind(null, id)}
          cancelHref={`/departments/${id}`}
          heading={{
            title: t('editTitle', { name: group.name }),
            eyebrow: <BackLink fallback={{ href: `/departments/${id}`, label: group.name }} />,
          }}
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
  const read = useQuery({ ...readQuery('position-form', { id }), ...FORM_READ })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={4} />} entity="positions">
      {({ position, departments }) =>
        position && id ? (
          <PositionForm
            action={savePositionAction.bind(null, id)}
            cancelHref={`/positions/${id}`}
            heading={{
              title: t('editTitle', { name: position.name }),
              eyebrow: <BackLink fallback={{ href: `/positions/${id}`, label: position.name }} />,
            }}
            defaults={position}
            departments={departments}
          />
        ) : (
          <PositionForm
            isNew
            action={savePositionAction.bind(null, null)}
            cancelHref="/positions"
            heading={{
              title: t('newTitle'),
              eyebrow: <BackLink fallback={{ href: '/positions', label: t('title') }} />,
            }}
            defaults={{ name: '', departmentIds: [] }}
            departments={departments}
          />
        )
      }
    </ReadView>
  )
}
