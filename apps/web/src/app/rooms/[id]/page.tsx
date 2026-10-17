import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { RoomView } from '@/features/rooms/room-view'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ id: string }>
}

// The tab says the room's name once its data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('rooms'))('title') }
}

export default async function RoomPage({ params }: Props) {
  const user = await requireReader()
  const { id } = await params
  if (!(await recordExists('room', id))) notFound()
  return <RoomView id={id} canEdit={canWrite(user.role)} />
}
