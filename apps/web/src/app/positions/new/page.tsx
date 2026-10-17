import { listGroupOptions } from '@muni/db/repositories'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { PositionForm } from '@/components/form/entity-forms'
import { savePositionAction } from '@/server/actions/groups'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('newTitle') }
}

export default async function NewPositionPage() {
  await requireAdminPage()
  const [departments, t] = await Promise.all([
    listGroupOptions('department'),
    getTranslations('positions'),
  ])
  return (
    <PositionForm
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
