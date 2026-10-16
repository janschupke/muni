import { getComplianceMatrix } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDate } from '@muni/utils/format'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { ComplianceMatrixTable } from '@/features/compliance/compliance-matrix'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('compliance'))('title') }
}

export default async function CompliancePage() {
  await requireReader()
  const [matrix, t, locale] = await Promise.all([
    getComplianceMatrix(),
    getTranslations('compliance'),
    getLocale(),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={`${t('description')} ${formatDate(matrix.asOf, locale)}`}
      />
      {matrix.courses.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ComplianceMatrixTable matrix={matrix} />
      )}
    </>
  )
}
