import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ProviderView } from '@/features/providers/provider-view'
import { COMPLETION_SORT, PROVIDER_COURSE_SORT, SESSION_SORT } from '@/lib/list/list-keys'
import { parseList, type SearchParams } from '@/lib/list/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ id: string }>
  /** Its lists' sort and page (`sessionsSort`, `coursesSort`, `completionsSort`…). */
  searchParams: SearchParams
}

const inputOf = async ({ params, searchParams }: Props) => {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return {
    id,
    ...parseList(query, SESSION_SORT, 'sessions'),
    ...parseList(query, PROVIDER_COURSE_SORT, 'courses'),
    ...parseList(query, COMPLETION_SORT, 'completions'),
  }
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata(props: Props): Promise<Metadata> {
  return titleOf(
    { name: 'provider', input: await inputOf(props) },
    data => data.name,
    (await getTranslations('providers'))('title')
  )
}

export default async function ProviderPage(props: Props) {
  const user = await requireReader()
  const input = await inputOf(props)
  return prefetched(
    user,
    [{ name: 'provider', input }],
    <ProviderView id={input.id} canEdit={canWrite(user.role)} />
  )
}
