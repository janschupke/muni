'use client'

import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ImportWizard } from './import-wizard'

/**
 * The import, checked against the records there are now. The snapshot is read once per visit:
 * a check half-way through an import never changes under the user.
 */
export function ImportView() {
  const t = useTranslations('import')
  const read = useQuery({
    ...readQuery('import-reference', {}),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ReadView titled query={read} skeleton={<TableSkeleton rows={3} columns={3} />}>
        {({ reference, today }) => <ImportWizard reference={reference} today={today} />}
      </ReadView>
    </>
  )
}
