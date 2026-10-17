import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GroupBookingsView } from '@/features/org/group-bookings'
import { BOOKING_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ id: string }>
  /** The list's sort and page. */
  searchParams: SearchParams
}

const inputOf = async ({ params, searchParams }: Props) => {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return { kind: 'position' as const, id, ...parseList(query, BOOKING_SORT) }
}

/** "Upcoming bookings: <the position>". */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = await getTranslations('org.bookings')
  return titleOf(
    { name: 'group-bookings', input: await inputOf(props) },
    data => `${t('title')}: ${data.name}`,
    t('title')
  )
}

export default async function PositionBookingsPage(props: Props) {
  const user = await requireReader()
  const input = await inputOf(props)
  return prefetched(
    user,
    [{ name: 'group-bookings', input }],
    <GroupBookingsView kind="position" id={input.id} canEdit={canWrite(user.role)} />
  )
}
