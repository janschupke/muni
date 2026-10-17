'use client'

import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ProvidersTable } from './providers-table'

export function ProvidersView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('providers')
  const create = canEdit && { href: '/providers/new', label: t('new') }
  const read = useQuery(readQuery('providers-list', {}))
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={create && <ListActions kind="provider" create={create} />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {({ providers, prices }) =>
          providers.length === 0 ? (
            <ListEmpty title={t('empty')} create={create} />
          ) : (
            <ProvidersTable providers={providers} prices={prices} canEdit={canEdit} />
          )
        }
      </ReadView>
    </>
  )
}
