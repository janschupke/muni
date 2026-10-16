import { getRoomForEdit } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { DeleteRoomButton } from '@/features/rooms/delete-room-button'
import { RoomForm } from '@/features/rooms/room-form'
import { removeRoom, saveRoom } from '@/server/actions/rooms'
import { requirePageUser } from '@/server/auth'

export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser()
  const { id } = await params
  const [room, t] = await Promise.all([getRoomForEdit(id), getTranslations('rooms.form')])
  if (!room) notFound()
  return (
    <>
      <PageHeader
        title={t('editTitle', { name: room.name })}
        eyebrow={<BackLink fallback={{ href: `/rooms/${id}`, label: room.name }} />}
      />
      <RoomForm action={saveRoom.bind(null, id)} cancelHref={`/rooms/${id}`} defaults={room} />
      <hr className="my-8 max-w-2xl border-border-muted" />
      <DeleteRoomButton name={room.name} action={removeRoom.bind(null, id)} />
    </>
  )
}
