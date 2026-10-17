import type { RoomRef } from '@muni/domain/rooms'
import { TextLink } from '@muni/ui/text-link'
import { formatTimeRange } from '@muni/utils/format'
import { Wifi } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { RecordLink } from './archived'

const sessionHref = (externalId: string) => `/sessions/${externalId}`
const roomHref = (room: RoomRef) => `/rooms/${encodeURIComponent(room.id)}`

// These links sit stacked in table cells and card headers; 24px tall (`hitArea`) keeps them
// apart enough to hit (WCAG 2.2 target size).

/** A session's date and time, linking to the session. */
export function SessionDateLink({
  session,
  emphasis = false,
  inText = false,
}: {
  session: { externalId: string; startsAt: string; endsAt: string }
  emphasis?: boolean | undefined
  /** Inside a sentence: underlined (see TextLink). */
  inText?: boolean | undefined
}) {
  const locale = useLocale()
  return (
    <TextLink asChild emphasis={emphasis} inText={inText} hitArea>
      <Link href={sessionHref(session.externalId)}>
        {formatTimeRange(session.startsAt, session.endsAt, locale)}
      </Link>
    </TextLink>
  )
}

/** A room, linking to its page (its equipment and every session held there); muted once archived. */
export function RoomLink({
  room,
  inText = false,
}: {
  room: RoomRef
  /** Inside a sentence: underlined (see TextLink). */
  inText?: boolean | undefined
}) {
  const t = useTranslations('common')
  return (
    <span className="inline-flex items-center gap-1.5">
      {room.kind === 'ONLINE' && (
        <>
          <Wifi aria-hidden className="size-3.5 text-fg-muted" />
          <span className="sr-only">{t('online')}</span>
        </>
      )}
      <RecordLink href={roomHref(room)} archived={room.archived ?? false} inText={inText}>
        {room.name}
      </RecordLink>
    </span>
  )
}
