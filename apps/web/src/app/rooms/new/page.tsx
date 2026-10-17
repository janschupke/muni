import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { RoomForm } from '@/features/rooms/room-form'
import { saveRoom } from '@/server/actions/rooms'
import { requireAdminPage } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('rooms.form'))('newTitle') }
}

export default async function NewRoomPage() {
  await requireAdminPage()
  const t = await getTranslations('rooms')
  return (
    <RoomForm
      isNew
      action={saveRoom.bind(null, null)}
      cancelHref="/rooms"
      heading={{
        title: t('form.newTitle'),
        eyebrow: <BackLink fallback={{ href: '/rooms', label: t('title') }} />,
      }}
      defaults={{ name: '', kind: 'CLASSROOM', capacity: null, capabilities: [], note: null }}
    />
  )
}
