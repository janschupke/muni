import { listProviders } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ListActions } from '@/components/list-actions'
import { ProvidersTable } from '@/features/providers/providers-table'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('providers'))('title') }
}

export default async function ProvidersPage() {
  const user = await requireReader()
  const [{ providers, prices }, t] = await Promise.all([
    listProviders(user.role),
    getTranslations('providers'),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite(user.role) && (
            <ListActions kind="provider" create={{ href: '/providers/new', label: t('new') }} />
          )
        }
      />
      {providers.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ProvidersTable providers={providers} prices={prices} canEdit={canWrite(user.role)} />
      )}
    </>
  )
}
