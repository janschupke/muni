import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { SessionView } from '@/features/sessions/session-view'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ externalId: string }>
}

// The tab names the course and day once the session's data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sessions'))('title') }
}

export default async function SessionPage({ params }: Props) {
  const user = await requireReader()
  const { externalId } = await params
  if (!(await recordExists('session', externalId))) notFound()
  return <SessionView externalId={externalId} canEdit={canWrite(user.role)} />
}
