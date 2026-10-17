import { canWrite } from '@muni/domain/enums'
import { EMPLOYEE_SORT_KEYS } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PositionView } from '@/features/org/group-views'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ id: string }>
  /** Its lists' sort and page (`peopleSort`…). */
  searchParams: SearchParams
}

const inputOf = async ({ params, searchParams }: Props) => {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return {
    id,
    ...parseList(query, EMPLOYEE_SORT_KEYS, 'people'),
  }
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata(props: Props): Promise<Metadata> {
  return titleOf(
    { name: 'position', input: await inputOf(props) },
    data => data.name,
    (await getTranslations('positions'))('title')
  )
}

export default async function PositionPage(props: Props) {
  const user = await requireReader()
  const input = await inputOf(props)
  return prefetched(
    user,
    [{ name: 'position', input }],
    <PositionView id={input.id} canEdit={canWrite(user.role)} />
  )
}
