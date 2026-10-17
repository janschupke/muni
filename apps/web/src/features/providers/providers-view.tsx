'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/list-view'
import { TableSkeleton } from '@/components/skeletons'
import { PROVIDER_SORT } from '@/lib/list-keys'
import { useListUrl } from '@/lib/use-list-url'

import { ProvidersTable } from './providers-table'

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
      skeleton={<TableSkeleton columns={5} />}
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
