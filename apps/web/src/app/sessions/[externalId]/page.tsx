import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { SessionView } from '@/features/sessions/session-view'
import { sessionTitle } from '@/lib/titles'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ externalId: string }>
}

/** The course and the day, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ externalId }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations('sessions'),
  ])
  return titleOf(
    { name: 'session', input: { externalId } },
    ({ session }) => sessionTitle(session, locale),
    t('title')
  )
}

export default async function SessionPage({ params }: Props) {
  const user = await requireReader()
  const { externalId } = await params
  return prefetched(
    user,
    [{ name: 'session', input: { externalId } }],
    <SessionView externalId={externalId} canEdit={canWrite(user.role)} />
  )
}
