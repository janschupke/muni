import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CoursesView } from '@/features/courses/courses-view'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursesPage() {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'courses-list', input: {} }],
    <CoursesView canEdit={canWrite(user.role)} />
  )
}
