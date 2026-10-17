'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { ProvidersTable } from './providers-table'

export function ProvidersView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('providers')
  const read = useQuery(readQuery('providers-list', {}))
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canEdit && (
            <ListActions kind="provider" create={{ href: '/providers/new', label: t('new') }} />
          )
        }
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {({ providers, prices }) =>
          providers.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <ProvidersTable providers={providers} prices={prices} canEdit={canEdit} />
          )
        }
      </ReadView>
    </>
  )
}
