import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { DepartmentForm } from '@/components/form/group-forms'
import { saveDepartmentAction } from '@/server/actions/groups'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('newTitle') }
}

export default async function NewDepartmentPage() {
  await requireAdminPage()
  const t = await getTranslations('departments')
  return (
    <DepartmentForm
      isNew
      action={saveDepartmentAction.bind(null, null)}
      cancelHref="/departments"
      heading={{
        title: t('newTitle'),
        eyebrow: <BackLink fallback={{ href: '/departments', label: t('title') }} />,
      }}
      defaults={{ name: '', headId: null }}
      members={[]}
    />
  )
}
