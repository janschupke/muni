import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ComplianceView } from '@/features/compliance/compliance-view'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('compliance'))('title') }
}

export default async function CompliancePage() {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'compliance', input: {} }],
    <ComplianceView canBook={canWrite(user.role)} />
  )
}
