'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDate } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { HeaderSkeleton, TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ComplianceMatrixTable } from './compliance-matrix'

/** Every course against every department, and each department's people. */
export function ComplianceView() {
  const t = useTranslations('compliance')
  const locale = useLocale()
  const read = useQuery(readQuery('compliance', {}))
  return (
    <ReadView
      query={read}
      skeleton={
        <>
          <HeaderSkeleton />
          <TableSkeleton rows={10} columns={8} />
        </>
      }
    >
      {matrix => (
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
      )}
    </ReadView>
  )
}
