'use client'

import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { PageHeader } from '@muni/ui/page-header'
import { Select } from '@muni/ui/select'
import { Toolbar } from '@muni/ui/toolbar'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarClock, History } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { SessionTable } from '@/components/session-table'
import { TableSkeleton } from '@/components/skeletons'
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
  const create = canEdit && { href: '/sessions/new', label: t('new') }
  const router = useRouter()
  const read = useQuery({
    ...readQuery('sessions-list', sessionsListInput(when, roomId)),
    placeholderData: keepPreviousData,
  })
  const href = (changes: Record<string, string | undefined>) =>
    withParams('/sessions', { when: when === 'past' ? 'past' : undefined, room: roomId }, changes)
  const room = read.data?.room
  return (
    <>
      <PageHeader
        title={room ? t('titleAt', { room: room.name }) : t('title')}
        description={t('description')}
        actions={create && <ListActions kind="session" create={create} />}
      />
      <Toolbar>
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
        <Select
          aria-label={t('roomFilter')}
          className="w-full sm:w-56"
          value={roomId ?? ''}
          emptyLabel={t('allRooms')}
          onValueChange={value => {
            router.push(href({ room: value === '' ? undefined : value }))
          }}
          options={(read.data?.rooms ?? []).map(r => ({ value: r.id, label: r.name }))}
        />
      </Toolbar>
      <ReadView titled query={read} skeleton={<TableSkeleton columns={6} />}>
        {({ sessions }) => (
          <div
            aria-busy={read.isPlaceholderData || undefined}
            className={
              read.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'
            }
          >
            {sessions.length === 0 ? (
              <ListEmpty title={t('empty')} create={create} />
            ) : (
              <SessionTable sessions={sessions} canEdit={canEdit} />
            )}
          </div>
        )}
      </ReadView>
    </>
  )
}
