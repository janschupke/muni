import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { DepartmentView } from '@/features/org/group-views'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

// The tab says the department's name once its data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('title') }
}

export default async function DepartmentPage({ params }: Props) {
  const user = await requireReader()
  const { id } = await params
  if (!(await recordExists('department', id))) notFound()
  return <DepartmentView id={id} canEdit={canWrite(user.role)} />
}
