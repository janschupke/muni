import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { UsersView } from '@/features/users/users-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('users'))('title') }
}

export default async function UsersPage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'users-list', input: {} }], <UsersView />)
}
