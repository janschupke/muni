'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { PageHeader } from '@muni/ui/page-header'
import { TextLink } from '@muni/ui/text-link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarClock, History } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { SessionTable } from '@/components/session-table'
import { HeaderSkeleton, TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { sessionsListInput } from '@/lib/read-inputs'
import { withParams } from '@/lib/search-params'

const WINDOWS = ['upcoming', 'past'] as const

/** Upcoming or past sessions, everywhere or in one room (`?when=past`, `?room=`). */
export function SessionsView({
  when,
  room: roomId,
  canEdit,
}: {
  when: 'upcoming' | 'past'
  room: string | undefined
  canEdit: boolean
}) {
  const t = useTranslations('sessions')
  const read = useQuery({
    ...readQuery('sessions-list', sessionsListInput(when, roomId)),
    placeholderData: keepPreviousData,
  })
  const href = (changes: Record<string, string | undefined>) =>
    withParams('/sessions', { when: when === 'past' ? 'past' : undefined, room: roomId }, changes)
  return (
    <ReadView
      query={read}
      skeleton={
        <>
          <HeaderSkeleton />
          <TableSkeleton columns={6} />
        </>
      }
    >
      {({ sessions, room }) => (
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
            actions={
              canEdit && (
                <ListActions kind="session" create={{ href: '/sessions/new', label: t('new') }} />
              )
            }
          />
          <LinkTabs aria-label={t('title')}>
            {WINDOWS.map(w => (
              <LinkTab key={w} asChild active={when === w}>
                <Link href={href({ when: w === 'past' ? 'past' : undefined })}>
                  {w === 'past' ? <History aria-hidden /> : <CalendarClock aria-hidden />}
                  {t(w)}
                </Link>
              </LinkTab>
            ))}
          </LinkTabs>
          <div
            aria-busy={read.isPlaceholderData || undefined}
            className={
              read.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'
            }
          >
            {sessions.length === 0 ? (
              <EmptyState title={t('empty')} />
            ) : (
              <SessionTable sessions={sessions} canEdit={canEdit} />
            )}
          </div>
        </>
      )}
    </ReadView>
  )
}
