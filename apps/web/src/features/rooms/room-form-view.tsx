'use client'

import { useTranslations } from 'next-intl'

import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveRoom } from '@/server/actions/rooms'

import { RoomForm } from './room-form'

/** A room to edit. (A new one needs nothing read: its page renders the empty form.) */
export function RoomFormView({ id }: { id: string }) {
  const t = useTranslations('rooms.form')
  const read = useFormRead('room-form', { id })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={6} />} entity="rooms">
      {room => (
        <RoomForm
          {...formShell({
            action: saveRoom.bind(null, id),
            back: { href: `/rooms/${id}`, label: room.name },
            title: t('editTitle', { name: room.name }),
          })}
          defaults={room}
        />
      )}
    </ReadView>
  )
}
