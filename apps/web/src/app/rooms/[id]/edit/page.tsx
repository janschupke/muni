import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RoomFormView } from '@/features/rooms/room-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

/** The form's heading as the tab's title, from the read the form shows. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const t = await getTranslations('rooms.form')
  return titleOf(
    { name: 'room-form', input: { id } },
    data => t('editTitle', { name: data.name }),
    (await getTranslations('rooms'))('title')
  )
}

export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage()
  const { id } = await params
  return prefetched(user, [{ name: 'room-form', input: { id } }], <RoomFormView id={id} />, {
    form: true,
  })
}
