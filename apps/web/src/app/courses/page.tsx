import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CoursesView } from '@/features/courses/courses-view'
import { COURSE_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'courses-list', input: parseList(await searchParams, COURSE_SORT) }],
    <CoursesView canEdit={canWrite(user.role)} />
  )
}
