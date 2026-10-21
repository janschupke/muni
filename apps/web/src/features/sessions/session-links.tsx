import type { RoomRef } from '@muni/domain/rooms'
import { TextLink } from '@muni/ui/text-link'
import { formatSessionTime } from '@muni/utils/format'
import { Wifi } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { RecordLink } from '@/components/badges/archived'
import { Link } from '@/components/navigation/link'

const sessionHref = (externalId: string, employee?: string) =>
  `/sessions/${externalId}${employee ? `?employee=${encodeURIComponent(employee)}` : ''}`
const roomHref = (room: RoomRef) => `/rooms/${encodeURIComponent(room.id)}`

// These links sit stacked in table cells and card headers; 24px tall (`hitArea`) keeps them
// apart enough to hit (WCAG 2.2 target size).

/**
 * A session's date and time, linking to the session; with `employee`, its page starts the
 * booking with that person (a session the advisor proposes for them).
 */
export function SessionDateLink({
  session,
  employee,
  emphasis = false,
}: {
  session: { externalId: string; startsAt: string; endsAt: string }
  employee?: string | undefined
  emphasis?: boolean | undefined
}) {
  return (
    <TextLink asChild emphasis={emphasis} hitArea>
      <Link href={sessionHref(session.externalId, employee)}>{formatSessionTime(session)}</Link>
    </TextLink>
  )
}

/** A room, linking to its page (its equipment and every session held there); muted once archived. */
export function RoomLink({ room }: { room: RoomRef }) {
  const t = useTranslations('common')
  return (
    <span className="inline-flex items-center gap-1.5">
      {room.kind === 'ONLINE' && (
        <>
          <Wifi aria-hidden className="size-3.5 text-fg-muted" />
          <span className="sr-only">{t('online')}</span>
        </>
      )}
      <RecordLink href={roomHref(room)} archived={room.archived ?? false}>
        {room.name}
      </RecordLink>
    </span>
  )
}
