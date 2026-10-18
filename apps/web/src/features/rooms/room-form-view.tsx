'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { RoomForm } from '@/components/form/room-form'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveRoom } from '@/server/actions/rooms'

/** A new room (no `id`), or one to edit. */
export function RoomFormView({ id }: { id?: string | undefined }) {
  const t = useTranslations()
  const read = useFormRead('room-form', { id })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={5} />} entity="rooms">
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
