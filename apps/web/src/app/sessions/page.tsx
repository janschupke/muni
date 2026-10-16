import { listSessions } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { SessionTable } from '@/components/session-table'
import { param, type SearchParams } from '@/lib/search-params'
import { getViewer } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sessions'))('title') }
}

const WINDOWS = [
  { value: 'upcoming', href: '/sessions' },
  { value: 'past', href: '/sessions?when=past' },
] as const

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const window = param(await searchParams, 'when') === 'past' ? 'past' : 'upcoming'
  const [sessions, viewer, t] = await Promise.all([
    listSessions({ window }),
    getViewer(),
    getTranslations('sessions'),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <LinkTabs aria-label={t('title')}>
        {WINDOWS.map(w => (
          <LinkTab key={w.value} asChild active={window === w.value}>
            <Link href={w.href}>{t(w.value)}</Link>
          </LinkTab>
        ))}
      </LinkTabs>
      {sessions.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <SessionTable sessions={sessions} canEdit={viewer === 'authenticated'} />
      )}
    </>
  )
}
