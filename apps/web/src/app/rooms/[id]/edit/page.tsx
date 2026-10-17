import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { RoomFormView } from '@/features/rooms/room-form-view'
import { requireAdminPage } from '@/server/auth'

export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  if (!(await recordExists('room', id))) notFound()
  return <RoomFormView id={id} />
}
