import { listRoomOptions } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SessionsView } from '@/features/sessions/sessions-view'
import { sessionsListInput } from '@/lib/read-inputs'
import { param, type SearchParams } from '@/lib/search-params'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

interface Props {
  searchParams: SearchParams
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const id = param(await searchParams, 'room')
  const [t, room] = await Promise.all([
    getTranslations('sessions'),
    id ? listRoomOptions().then(rooms => rooms.find(r => r.id === id)) : undefined,
  ])
  return { title: room ? t('titleAt', { location: room.name }) : t('title') }
}

export default async function SessionsPage({ searchParams }: Props) {
  const user = await requireReader()
  const params = await searchParams
  const when = param(params, 'when') === 'past' ? 'past' : 'upcoming'
  const room = param(params, 'room')
  return prefetched(
    user,
    [{ name: 'sessions-list', input: sessionsListInput(when, room) }],
    <SessionsView when={when} room={room} canEdit={canWrite(user.role)} />
  )
}
