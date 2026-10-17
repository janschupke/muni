'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDate } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ComplianceMatrixTable } from './compliance-matrix'

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
      <ReadView titled query={read} skeleton={<TableSkeleton rows={10} columns={8} />}>
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
