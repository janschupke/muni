import { listRoomOptions, listSessions } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { EmptyState } from '@muni/ui/empty-state'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { PageHeader } from '@muni/ui/page-header'
import { TextLink } from '@muni/ui/text-link'
import { CalendarClock, History } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { ListActions } from '@/components/list-actions'
import { SessionTable } from '@/components/session-table'
import { param, type SearchParams, withParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'

interface Props {
  searchParams: SearchParams
}

/** The room the list is filtered to, by its id in `?room=`. */
async function roomOf(params: Awaited<SearchParams>) {
  const id = param(params, 'room')
  return id ? ((await listRoomOptions()).find(r => r.id === id) ?? null) : null
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [t, room] = await Promise.all([getTranslations('sessions'), roomOf(await searchParams)])
  return { title: room ? t('titleAt', { location: room.name }) : t('title') }
}

const WINDOWS = ['upcoming', 'past'] as const

export default async function SessionsPage({ searchParams }: Props) {
  const user = await requireReader()
  const params = await searchParams
  const window = param(params, 'when') === 'past' ? 'past' : 'upcoming'
  const room = await roomOf(params)
  const [sessions, t] = await Promise.all([
    listSessions({ window, room: room?.id }),
    getTranslations('sessions'),
  ])
  const href = (changes: Record<string, string | undefined>) =>
    withParams(
      '/sessions',
      { when: window === 'past' ? 'past' : undefined, room: room?.id },
      changes
    )
  return (
    <>
      <PageHeader
        title={room ? t('titleAt', { location: room.name }) : t('title')}
        description={
          room ? (
            <TextLink asChild>
              <Link href={href({ room: undefined })}>{t('allLocations')}</Link>
            </TextLink>
          ) : (
            t('description')
          )
        }
        actions={canWrite(user.role) && <ListActions kind="session" />}
      />
      <LinkTabs aria-label={t('title')}>
        {WINDOWS.map(w => (
          <LinkTab key={w} asChild active={window === w}>
            <Link href={href({ when: w === 'past' ? 'past' : undefined })}>
              {w === 'past' ? <History aria-hidden /> : <CalendarClock aria-hidden />}
              {t(w)}
            </Link>
          </LinkTab>
        ))}
      </LinkTabs>
      {sessions.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <SessionTable sessions={sessions} canEdit={canWrite(user.role)} />
      )}
    </>
  )
}
