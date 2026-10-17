import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ProviderView } from '@/features/providers/provider-view'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ id: string }>
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return titleOf(
    { name: 'provider', input: { id } },
    data => data.name,
    (await getTranslations('providers'))('title')
  )
}

export default async function ProviderPage({ params }: Props) {
  const user = await requireReader()
  const { id } = await params
  return prefetched(
    user,
    [{ name: 'provider', input: { id } }],
    <ProviderView id={id} canEdit={canWrite(user.role)} />
  )
}
