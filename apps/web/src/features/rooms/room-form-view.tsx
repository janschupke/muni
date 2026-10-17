'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveRoom } from '@/server/actions/rooms'

import { RoomForm } from './room-form'

/** A room to edit. (A new one needs nothing read: its page renders the empty form.) */
export function RoomFormView({ id }: { id: string }) {
  const t = useTranslations('rooms.form')
  const read = useQuery({ ...readQuery('room-form', { id }), ...FORM_READ })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={6} />} entity="rooms">
      {room => (
        <RoomForm
          action={saveRoom.bind(null, id)}
          cancelHref={`/rooms/${id}`}
          heading={{
            title: t('editTitle', { name: room.name }),
            eyebrow: <BackLink fallback={{ href: `/rooms/${id}`, label: room.name }} />,
          }}
          defaults={room}
        />
      )}
    </ReadView>
  )
}
