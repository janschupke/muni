import { listCourseOptions, listRoomOptions } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SessionsView } from '@/features/sessions/sessions-view'
import { type SessionListQuery, sessionsListInput } from '@/lib/read-inputs'
import { param, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

interface Props {
  searchParams: SearchParams
}

const queryOf = (params: Awaited<SearchParams>): SessionListQuery => ({
  when: param(params, 'when') === 'past' ? 'past' : 'upcoming',
  room: param(params, 'room'),
  course: param(params, 'course'),
  page: Number(param(params, 'page') ?? 1) || 1,
})

/** "Sessions", or the room's or course's when the list is narrowed to one. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { room: roomId, course: code } = queryOf(await searchParams)
  const [t, room, course] = await Promise.all([
    getTranslations('sessions'),
    roomId ? listRoomOptions().then(rooms => rooms.find(r => r.id === roomId)) : undefined,
    code ? listCourseOptions().then(courses => courses.find(c => c.code === code)) : undefined,
  ])
  if (course) return { title: t('titleOf', { course: course.name }) }
  return { title: room ? t('titleAt', { room: room.name }) : t('title') }
}

export default async function SessionsPage({ searchParams }: Props) {
  const user = await requireReader()
  const query = queryOf(await searchParams)
  return prefetched(
    user,
    [{ name: 'sessions-list', input: sessionsListInput(query) }],
    <SessionsView query={query} canEdit={canWrite(user.role)} />
  )
}
