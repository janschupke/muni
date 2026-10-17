import { canWrite } from '@muni/domain/enums'

import { DashboardView } from '@/features/dashboard/dashboard-view'
import { ArchivedAccount } from '@/features/landing/archived-account'
import { Landing } from '@/features/landing/landing'
import { getSessionUser, isAccountArchived } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

/** Visitors get the introduction; signed-in users the dashboard. */
export default async function HomePage() {
  const user = await getSessionUser()
  if (!user) return (await isAccountArchived()) ? <ArchivedAccount /> : <Landing />
  return prefetched(
    user,
    [{ name: 'dashboard', input: {} }],
    <DashboardView canEdit={canWrite(user.role)} />
  )
}
