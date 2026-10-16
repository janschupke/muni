import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { GroupForm } from '@/components/form/entity-forms'
import { saveGroup } from '@/server/actions/groups'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('newTitle') }
}

export default async function NewPositionPage() {
  await requireAdminPage()
  const t = await getTranslations('positions')
  return (
    <GroupForm
      action={saveGroup.bind(null, 'position', null)}
      cancelHref="/positions"
      heading={{
        title: t('newTitle'),
        eyebrow: <BackLink fallback={{ href: '/positions', label: t('title') }} />,
      }}
      defaults={{ name: '' }}
    />
  )
}
