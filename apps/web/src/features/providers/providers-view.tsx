'use client'

import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { PROVIDER_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { useListUrl } from '@/lib/use-list-url'

import { ProvidersTable } from './providers-table'

/** Providers, a page at a time, sorted on the server. */
export function ProvidersView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('providers')
  const create = canEdit && { href: '/providers/new', label: t('new') }
  const list = useListUrl(PROVIDER_SORT)
  const read = useQuery({
    ...readQuery('providers-list', list.input),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={create && <ListActions kind="provider" create={create} />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {({ providers, prices }) =>
          providers.total === 0 ? (
            <ListEmpty title={t('empty')} create={create} />
          ) : (
            <ProvidersTable
              providers={providers.items}
              paging={list.paging(providers)}
              prices={prices}
              canEdit={canEdit}
            />
          )
        }
      </ReadView>
    </>
  )
}
