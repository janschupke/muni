'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDate } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/views/read-view'
import { PageLoading, TableSkeleton } from '@/components/views/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ComplianceMatrixTable } from './compliance-matrix'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <TableSkeleton rows={10} columns={8} />

/** Every course against every department, and each department's people. */
export function ComplianceView({ canBook }: { canBook: boolean }) {
  const t = useTranslations('compliance')
  const read = useQuery(readQuery('compliance', {}))
  const asOf = read.data?.asOf
  return (
    <>
      <PageHeader
        title={t('title')}
        description={asOf ? t('descriptionOn', { date: formatDate(asOf) }) : t('description')}
      />
      <ReadView titled query={read} skeleton={SKELETON}>
        {matrix =>
          matrix.courses.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <ComplianceMatrixTable matrix={matrix} canBook={canBook} />
          )
        }
      </ReadView>
    </>
  )
}

/** The page until its data is there (its route's `loading.tsx`): its heading, then the rows. */
export function ComplianceLoading() {
  const t = useTranslations('compliance')
  return (
    <PageLoading title={t('title')} description={t('description')}>
      {SKELETON}
    </PageLoading>
  )
}
