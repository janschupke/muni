import { listProviders } from '@muni/db/repositories'
import { Button } from '@muni/ui/button'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { ProvidersTable } from '@/features/providers/providers-table'
import { getViewer } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('providers'))('title') }
}

export default async function ProvidersPage() {
  const viewer = await getViewer()
  const [{ providers, prices }, t] = await Promise.all([
    listProviders(viewer),
    getTranslations('providers'),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          viewer === 'authenticated' && (
            <Button asChild variant="primary">
              <Link href="/providers/new">
                <Plus aria-hidden />
                {t('new')}
              </Link>
            </Button>
          )
        }
      />
      {providers.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ProvidersTable providers={providers} prices={prices} />
      )}
    </>
  )
}
