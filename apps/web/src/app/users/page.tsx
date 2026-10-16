import { listUsers } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ListActions } from '@/components/list-actions'
import { UsersTable } from '@/features/users/users-table'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('users'))('title') }
}

export default async function UsersPage() {
  await requireAdminPage()
  const [users, t] = await Promise.all([listUsers(), getTranslations('users')])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<ListActions kind="user" />}
      />
      <UsersTable users={users} />
    </>
  )
}
