import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GroupsView } from '@/features/org/groups-view'
import { GROUP_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'positions-list', input: parseList(await searchParams, GROUP_SORT) }],
    <GroupsView kind="positions" canEdit={canWrite(user.role)} />
  )
}
