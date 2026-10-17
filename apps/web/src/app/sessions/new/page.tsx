import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SessionFormView } from '@/features/sessions/session-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sessions'))('newTitle') }
}

/** A new session of a course chosen in the form (from the sessions list). */

export default async function NewSessionPage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'session-form', input: {} }], <SessionFormView />, {
    form: true,
  })
}
