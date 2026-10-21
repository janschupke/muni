'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { PageLoading, TableSkeleton } from '@/components/views/skeletons'
import { PROVIDER_SORT } from '@/lib/list/list-keys'
import { useListUrl } from '@/lib/list/use-list-url'

import { ProvidersTable } from './providers-table'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <TableSkeleton columns={5} />

/** Providers, a page at a time, sorted on the server. */
export function ProvidersView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('providers')
  const list = useListUrl(PROVIDER_SORT)
  return (
    <ListView
      kind="provider"
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      canEdit={canEdit}
      create={{ href: '/providers/new', label: t('new') }}
      read={useListRead('providers-list', list.input)}
      skeleton={SKELETON}
      totalOf={({ providers }) => providers.total}
    >
      {({ providers, prices }) => (
        <ProvidersTable
          providers={providers.items}
          paging={list.paging(providers)}
          prices={prices}
          canEdit={canEdit}
        />
      )}
    </ListView>
  )
}

/** The page until its data is there (its route's `loading.tsx`): its heading, then the rows. */
export function ProvidersLoading() {
  const t = useTranslations('providers')
  return (
    <PageLoading title={t('title')} description={t('description')}>
      {SKELETON}
    </PageLoading>
  )
}
