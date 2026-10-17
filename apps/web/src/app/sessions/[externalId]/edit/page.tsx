import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** Named attendees are added and removed on the session's page; the form edits the rest. */

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ externalId: string }>
}): Promise<Metadata> {
  const { externalId } = await params
  const t = await getTranslations()
  return titleOf(
    { name: 'session-form', input: { externalId } },
    data =>
      data.session &&
      t('sessions.editTitle', { name: `${data.session.externalId} · ${data.session.courseName}` }),
    t('sessions.title')
  )
}

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  const user = await requireAdminPage()
  const { externalId } = await params
  return prefetched(
    user,
    [{ name: 'session-form', input: { externalId } }],
    <SessionFormView externalId={externalId} />,
    { form: true }
  )
}
