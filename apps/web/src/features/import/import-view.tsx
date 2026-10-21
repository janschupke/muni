'use client'

import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/views/read-view'
import { ImportSkeleton, PageLoading } from '@/components/views/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ImportWizard } from './import-wizard'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <ImportSkeleton />

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
      <ReadView titled query={read} skeleton={SKELETON}>
        {({ reference, today }) => <ImportWizard reference={reference} today={today} />}
      </ReadView>
    </>
  )
}

/** The page until its data is there (its route's `loading.tsx`): its heading, then the rows. */
export function ImportLoading() {
  const t = useTranslations('import')
  return (
    <PageLoading title={t('title')} description={t('description')}>
      {SKELETON}
    </PageLoading>
  )
}
