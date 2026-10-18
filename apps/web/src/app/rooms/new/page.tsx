import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RoomFormView } from '@/features/rooms/room-form-view'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('forms.room'))('newTitle') }
}

export default async function NewRoomPage() {
  const user = await requireAdminPage()
  return prefetched(user, [{ name: 'room-form', input: {} }], <RoomFormView />, { form: true })
}
