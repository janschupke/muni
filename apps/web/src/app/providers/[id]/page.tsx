import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ProviderView } from '@/features/providers/provider-view'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

// The tab says the provider's name once its data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('providers'))('title') }
}

export default async function ProviderPage({ params }: Props) {
  const user = await requireReader()
  const { id } = await params
  if (!(await recordExists('provider', id))) notFound()
  return <ProviderView id={id} canEdit={canWrite(user.role)} />
}
