import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CourseView } from '@/features/courses/course-view'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ code: string }>
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return titleOf(
    { name: 'course', input: { code } },
    data => data.name,
    (await getTranslations('courses'))('title')
  )
}

export default async function CoursePage({ params }: Props) {
  const user = await requireReader()
  const { code } = await params
  return prefetched(
    user,
    [{ name: 'course', input: { code } }],
    <CourseView code={code} canEdit={canWrite(user.role)} />
  )
}
