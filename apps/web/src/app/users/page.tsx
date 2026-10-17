import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { UsersView } from '@/features/users/users-view'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('users'))('title') }
}

export default async function UsersPage() {
  await requireAdminPage()
  return <UsersView />
}
