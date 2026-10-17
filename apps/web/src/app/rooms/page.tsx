import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RoomsView } from '@/features/rooms/rooms-view'
import { ROOM_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('rooms'))('title') }
}

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'rooms-list', input: parseList(await searchParams, ROOM_SORT) }],
    <RoomsView canEdit={canWrite(user.role)} />
  )
}
