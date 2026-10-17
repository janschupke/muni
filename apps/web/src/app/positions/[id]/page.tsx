import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { PositionView } from '@/features/org/group-views'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

// The tab says the position's name once its data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionPage({ params }: Props) {
  const user = await requireReader()
  const { id } = await params
  if (!(await recordExists('position', id))) notFound()
  return <PositionView id={id} canEdit={canWrite(user.role)} />
}
