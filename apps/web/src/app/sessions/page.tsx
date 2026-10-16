import { listSessions } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { PageHeader } from '@muni/ui/page-header'
import { TextLink } from '@muni/ui/text-link'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { SessionTable } from '@/components/session-table'
import { param, withParams, type SearchParams } from '@/lib/search-params'
import { getViewer } from '@/server/auth'

type Props = { searchParams: SearchParams }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [t, location] = [await getTranslations('sessions'), param(await searchParams, 'location')]
  return { title: location ? t('titleAt', { location }) : t('title') }
}

const WINDOWS = ['upcoming', 'past'] as const

export default async function SessionsPage({ searchParams }: Props) {
  const params = await searchParams
  const window = param(params, 'when') === 'past' ? 'past' : 'upcoming'
  const location = param(params, 'location')
  const [sessions, viewer, t] = await Promise.all([
    listSessions({ window, location }),
    getViewer(),
    getTranslations('sessions'),
  ])
  const href = (changes: Record<string, string | undefined>) =>
    withParams('/sessions', { when: window === 'past' ? 'past' : undefined, location }, changes)
  return (
    <>
      <PageHeader
        title={location ? t('titleAt', { location }) : t('title')}
        description={
          location ? (
            <TextLink asChild>
              <Link href={href({ location: undefined })}>{t('allLocations')}</Link>
            </TextLink>
          ) : (
            t('description')
          )
        }
      />
      <LinkTabs aria-label={t('title')}>
        {WINDOWS.map(w => (
          <LinkTab key={w} asChild active={window === w}>
            <Link href={href({ when: w === 'past' ? 'past' : undefined })}>{t(w)}</Link>
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
