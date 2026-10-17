import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { CoursesView } from '@/features/courses/courses-view'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursesPage() {
  const user = await requireReader()
  return <CoursesView canEdit={canWrite(user.role)} />
}
