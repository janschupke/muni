import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CourseView } from '@/features/courses/course-view'
import { COMPLETION_SORT, SESSION_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ code: string }>
  /** The sessions' and completions' sort and page (`sessionsSort`, `completionsPage`…). */
  searchParams: SearchParams
}

const inputOf = async ({ params, searchParams }: Props) => {
  const [{ code }, query] = await Promise.all([params, searchParams])
  return {
    code,
    ...parseList(query, SESSION_SORT, 'sessions'),
    ...parseList(query, COMPLETION_SORT, 'completions'),
  }
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata(props: Props): Promise<Metadata> {
  return titleOf(
    { name: 'course', input: await inputOf(props) },
    data => data.name,
    (await getTranslations('courses'))('title')
  )
}

export default async function CoursePage(props: Props) {
  const user = await requireReader()
  const input = await inputOf(props)
  return prefetched(
    user,
    [{ name: 'course', input }],
    <CourseView code={input.code} canEdit={canWrite(user.role)} />
  )
}
