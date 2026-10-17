import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GroupsView } from '@/features/org/groups-view'
import { requireReader } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('title') }
}

export default async function DepartmentsPage() {
  const user = await requireReader()
  return prefetched(
    user,
    [{ name: 'departments-list', input: {} }],
    <GroupsView kind="departments" canEdit={canWrite(user.role)} />
  )
}
