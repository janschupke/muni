import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RoomView } from '@/features/rooms/room-view'
import { SESSION_SORT } from '@/lib/list/list-keys'
import { parseList, type SearchParams } from '@/lib/list/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ id: string }>
  /** Its lists' sort and page (`sessionsSort`…). */
  searchParams: SearchParams
}

const inputOf = async ({ params, searchParams }: Props) => {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return {
    id,
    ...parseList(query, SESSION_SORT, 'sessions'),
  }
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata(props: Props): Promise<Metadata> {
  return titleOf(
    { name: 'room', input: await inputOf(props) },
    data => data.name,
    (await getTranslations('rooms'))('title')
  )
}

export default async function RoomPage(props: Props) {
  const user = await requireReader()
  const input = await inputOf(props)
  return prefetched(
    user,
    [{ name: 'room', input }],
    <RoomView id={input.id} canEdit={canWrite(user.role)} />
  )
}
