'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/views/read-view'
import { FormSkeleton, PageLoading } from '@/components/views/skeletons'
import { RoomForm } from '@/features/rooms/room-form'
import { saveRoom } from '@/server/actions/rooms'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <FormSkeleton fields={5} />

/** A new room (no `id`), or one to edit. */
export function RoomFormView({ id }: { id?: string | undefined }) {
  const t = useTranslations()
  const read = useFormRead('room-form', { id })
  return (
    <ReadView query={read} skeleton={SKELETON} entity="rooms">
      {({ room }) =>
        room && id ? (
          <RoomForm
            {...formShell({
              action: saveRoom.bind(null, id),
              back: { href: `/rooms/${id}`, label: room.name },
              title: t('forms.room.editTitle', { name: room.name }),
            })}
            defaults={room}
          />
        ) : (
          <RoomForm
            {...formShell({
              action: saveRoom.bind(null, null),
              back: { href: '/rooms', label: t('rooms.title') },
              title: t('forms.room.newTitle'),
              isNew: true,
            })}
            defaults={{ name: '', kind: 'CLASSROOM', capacity: null, capabilities: [], note: null }}
          />
        )
      }
    </ReadView>
  )
}

/** The page until its data is there (its route's `loading.tsx`). */
export function RoomFormLoading() {
  return <PageLoading>{SKELETON}</PageLoading>
}
