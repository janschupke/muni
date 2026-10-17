import { RoomFormView } from '@/features/rooms/room-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(user, [{ name: 'room-form', input: { id } }], <RoomFormView id={id} />, {
    form: true,
  })
}
