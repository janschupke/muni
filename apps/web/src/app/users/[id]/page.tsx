import { recordExists } from '@muni/db/repositories'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { UserView } from '@/features/users/user-view'
import { requireAdminPage } from '@/server/auth'

// The tab says the user's name once their data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('users'))('title') }
}

/** One user, for admins: their account, their role (changed here, stored in Clerk), archiving. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  if (!(await recordExists('user', id))) notFound()
  return <UserView id={id} />
}
