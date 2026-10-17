import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GroupsView } from '@/features/org/groups-view'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionsPage() {
  const user = await requireReader()
  return <GroupsView kind="positions" canEdit={canWrite(user.role)} />
}
