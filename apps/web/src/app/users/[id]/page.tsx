import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { UserView } from '@/features/users/user-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return titleOf(
    { name: 'user', input: { id } },
    ({ user }) => user.name ?? user.email ?? user.clerkId,
    (await getTranslations('users'))('title')
  )
}

/** One user, for admins: their account, their role (changed here, stored in Clerk), archiving. */

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(user, [{ name: 'user', input: { id } }], <UserView id={id} />)
}
