'use client'

import { IconButton } from '@muni/ui/icon-button'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { PageHeader } from '@muni/ui/page-header'
import { Pagination } from '@muni/ui/pagination'
import { Select } from '@muni/ui/select'
import { Toolbar, ToolbarChip } from '@muni/ui/toolbar'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarClock, History, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { usePaginationLabels } from '@/components/pagination-labels'
import { ReadView } from '@/components/read-view'
import { SessionTable } from '@/components/session-table'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { type SessionListQuery, sessionsListInput } from '@/lib/read-inputs'
import { withParams } from '@/lib/search-params'

const WINDOWS = ['upcoming', 'past'] as const

/**
 * Upcoming or past sessions, everywhere or in one room or of one course (`?when=past`,
 * `?room=`, `?course=`). The past comes a page at a time (`?page=`).
 */
export function SessionsView({ query, canEdit }: { query: SessionListQuery; canEdit: boolean }) {
  const t = useTranslations('sessions')
  const pagination = usePaginationLabels()
  const create = canEdit && { href: '/sessions/new', label: t('new') }
  const router = useRouter()
  const read = useQuery({
    ...readQuery('sessions-list', sessionsListInput(query)),
    placeholderData: keepPreviousData,
  })
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
    <>
      <PageHeader
        title={
          course
            ? t('titleOf', { course: course.name })
            : room
              ? t('titleAt', { room: room.name })
              : t('title')
        }
        description={t('description')}
        actions={create && <ListActions kind="session" create={create} />}
      />
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
      <ReadView titled query={read} skeleton={<TableSkeleton columns={6} />}>
        {({ sessions, paging }) => (
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
            {paging && (
              <Pagination
                page={paging.page}
                pageCount={paging.pageCount}
                hrefFor={p => href({ page: p > 1 ? p : undefined })}
                linkAs={Link}
                labels={{ ...pagination, status: pagination.status(paging.page, paging.pageCount) }}
              />
            )}
          </div>
        )}
      </ReadView>
    </>
  )
}
