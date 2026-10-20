'use client'

import { IconButton } from '@muni/ui/icon-button'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { Select } from '@muni/ui/select'
import { Toolbar, ToolbarChip } from '@muni/ui/toolbar'
import { CalendarClock, History, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { TableSkeleton } from '@/components/views/skeletons'
import { SessionTable } from '@/features/sessions/session-table'
import { SESSION_SORT } from '@/lib/list/list-keys'
import { type SessionListQuery, sessionsListInput } from '@/lib/list/read-inputs'
import { withParams } from '@/lib/list/search-params'
import { useListUrl } from '@/lib/list/use-list-url'

const WINDOWS = ['upcoming', 'past'] as const

/**
 * Upcoming or past sessions, everywhere or in one room or of one course (`?when=past`,
 * `?room=`, `?course=`), a page at a time, sorted on the server (`?sort=`, `?page=`).
 */
export function SessionsView({ query, canEdit }: { query: SessionListQuery; canEdit: boolean }) {
  const t = useTranslations('sessions')
  const router = useRouter()
  const list = useListUrl(SESSION_SORT, { id: 'date', desc: query.when === 'past' })
  const read = useListRead('sessions-list', sessionsListInput(query, list.input))
  // A change of window, room or course starts again from the first page.
  const href = (changes: Record<string, string | number | undefined>) =>
    withParams(
      '/sessions',
      {
        when: query.when === 'past' ? 'past' : undefined,
        room: query.room,
        course: query.course,
      },
      changes
    )
  const room = read.data?.room
  const course = read.data?.course
  return (
    <ListView
      kind="session"
      title={
        course
          ? t('titleOf', { course: course.name })
          : room
            ? t('titleAt', { room: room.name })
            : t('title')
      }
      description={t('description')}
      empty={t('empty')}
      canEdit={canEdit}
      create={{ href: '/sessions/new', label: t('new') }}
      read={read}
      skeleton={<TableSkeleton columns={6} />}
      totalOf={({ sessions }) => sessions.total}
      before={
        <>
          <LinkTabs aria-label={t('title')} className="mb-4">
            {WINDOWS.map(w => (
              <LinkTab key={w} asChild active={query.when === w}>
                <Link href={href({ when: w === 'past' ? 'past' : undefined })}>
                  {w === 'past' ? <History aria-hidden /> : <CalendarClock aria-hidden />}
                  {t(w)}
                </Link>
              </LinkTab>
            ))}
          </LinkTabs>
          <Toolbar>
            <Select
              aria-label={t('roomFilter')}
              className="w-full sm:w-56"
              value={query.room ?? ''}
              emptyLabel={t('allRooms')}
              onValueChange={value => {
                router.push(href({ room: value === '' ? undefined : value }))
              }}
              options={(read.data?.rooms ?? []).map(r => ({ value: r.id, label: r.name }))}
            />
            {course && (
              <ToolbarChip
                remove={
                  <IconButton asChild label={t('clearCourse')}>
                    <Link href={href({ course: undefined })}>
                      <X aria-hidden />
                    </Link>
                  </IconButton>
                }
              >
                {t('courseFilter', { course: course.name })}
              </ToolbarChip>
            )}
          </Toolbar>
        </>
      }
    >
      {({ sessions }) => (
        <SessionTable sessions={sessions.items} paging={list.paging(sessions)} canEdit={canEdit} />
      )}
    </ListView>
  )
}
