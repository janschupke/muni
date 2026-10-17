import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ComplianceView } from '@/features/compliance/compliance-view'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('compliance'))('title') }
}

export default async function CompliancePage() {
  await requireReader()
  return <ComplianceView />
}
