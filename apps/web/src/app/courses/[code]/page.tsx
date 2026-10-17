import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { CourseView } from '@/features/courses/course-view'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ code: string }>
}

// The tab says the course's name once its data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursePage({ params }: Props) {
  const user = await requireReader()
  const { code } = await params
  if (!(await recordExists('course', code))) notFound()
  return <CourseView code={code} canEdit={canWrite(user.role)} />
}
