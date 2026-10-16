import { listSessions } from '@muni/db/repositories'
import { cn } from '@muni/ui/cn'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { SessionTable } from '@/components/session-table'
import { getViewer } from '@/server/auth'
import { param, type SearchParams } from '@/lib/search-params'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sessions'))('title') }
}

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const window = param(await searchParams, 'when') === 'past' ? 'past' : 'upcoming'
  const [sessions, viewer, t] = await Promise.all([
    listSessions({ window }),
    getViewer(),
    getTranslations('sessions'),
  ])
  const tab = (value: 'upcoming' | 'past', href: string) => (
    <Link
      href={href}
      aria-current={window === value ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-muted hover:text-fg',
        window === value && 'border-accent text-fg'
      )}
    >
      {t(value)}
    </Link>
  )
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <nav className="mb-4 flex gap-1 border-b border-border-default">
        {tab('upcoming', '/sessions')}
        {tab('past', '/sessions?when=past')}
      </nav>
      {sessions.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <SessionTable sessions={sessions} canEdit={viewer === 'authenticated'} />
      )}
    </>
  )
}
