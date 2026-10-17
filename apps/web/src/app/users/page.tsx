import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { UsersView } from '@/features/users/users-view'
import { USER_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('users'))('title') }
}

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdminPage()
  return prefetched(
    user,
    [{ name: 'users-list', input: parseList(await searchParams, USER_SORT) }],
    <UsersView />
  )
}
