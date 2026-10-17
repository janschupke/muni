import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RoomsView } from '@/features/rooms/rooms-view'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('rooms'))('title') }
}

export default async function RoomsPage() {
  const user = await requireReader()
  return <RoomsView canEdit={canWrite(user.role)} />
}
