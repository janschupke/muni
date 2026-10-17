import { getDepartmentForEdit } from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { DepartmentForm } from '@/components/form/entity-forms'
import { saveDepartmentAction } from '@/server/actions/groups'
import { requireAdminPage } from '@/server/auth'

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const [group, t] = await Promise.all([getDepartmentForEdit(id), getTranslations('departments')])
  if (!group) notFound()
  return (
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
  )
}
