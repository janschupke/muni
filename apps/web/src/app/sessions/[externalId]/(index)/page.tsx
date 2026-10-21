import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SessionView } from '@/features/sessions/session-view'
import { sessionTitle } from '@/lib/format/titles'
import { param, type SearchParams } from '@/lib/list/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ externalId: string }>
  /** `employee`: the person to book, chosen in advance (the advisor's link to a session). */
  searchParams: SearchParams
}

/** The course and the day, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ externalId }, t] = await Promise.all([params, getTranslations('sessions')])
  return titleOf(
    { name: 'session', input: { externalId } },
    ({ session }) => sessionTitle(session),
    t('title')
  )
}

export default async function SessionPage({ params, searchParams }: Props) {
  const user = await requireReader()
  const [{ externalId }, query] = await Promise.all([params, searchParams])
  return prefetched(
    user,
    [{ name: 'session', input: { externalId } }],
    <SessionView
      externalId={externalId}
      canEdit={canWrite(user.role)}
      employee={param(query, 'employee')}
    />
  )
}
