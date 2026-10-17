import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ProvidersView } from '@/features/providers/providers-view'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('providers'))('title') }
}

export default async function ProvidersPage() {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'providers-list', input: {} }],
    <ProvidersView canEdit={canWrite(user.role)} />
  )
}
