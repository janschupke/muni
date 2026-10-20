import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GroupsView } from '@/features/org/groups-view'
import { GROUP_SORT } from '@/lib/list/list-keys'
import { parseList, type SearchParams } from '@/lib/list/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('title') }
}

export default async function DepartmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'departments-list', input: parseList(await searchParams, GROUP_SORT) }],
    <GroupsView kind="departments" canEdit={canWrite(user.role)} />
  )
}
