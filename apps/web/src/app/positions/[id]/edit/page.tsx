import { getGroupForEdit } from '@muni/db/repositories'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { GroupForm } from '@/components/form/entity-forms'
import { saveGroup } from '@/server/actions/groups'
import { requireAdminPage } from '@/server/auth'

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const [group, t] = await Promise.all([
    getGroupForEdit('position', id),
    getTranslations('positions'),
  ])
  if (!group) notFound()
  return (
    <GroupForm
      action={saveGroup.bind(null, 'position', id)}
      cancelHref={`/positions/${id}`}
      heading={{
        title: t('editTitle', { name: group.name }),
        eyebrow: <BackLink fallback={{ href: `/positions/${id}`, label: group.name }} />,
      }}
      defaults={group}
    />
  )
}
