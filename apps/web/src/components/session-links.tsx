import { TextLink } from '@muni/ui/text-link'
import { formatTimeRange } from '@muni/utils/format'
import { Wifi } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

const sessionHref = (externalId: string) => `/sessions/${externalId}`
const roomHref = (location: string) => `/sessions?location=${encodeURIComponent(location)}`

// These links sit stacked in table cells and card headers; 24px tall keeps them apart enough
// to hit (WCAG 2.2 target size).
const TARGET = 'inline-flex min-h-6 items-center'

/** A session's date and time, linking to the session. */
export function SessionDateLink({
  session,
  emphasis = false,
}: {
  session: { externalId: string; startsAt: string; endsAt: string }
  emphasis?: boolean
}) {
  const locale = useLocale()
  return (
    <TextLink asChild emphasis={emphasis}>
      <Link href={sessionHref(session.externalId)} className={TARGET}>
        {formatTimeRange(session.startsAt, session.endsAt, locale)}
      </Link>
    </TextLink>
  )
}

/** A room, linking to every session held there. */
export function RoomLink({ location, isOnline = false }: { location: string; isOnline?: boolean }) {
  const t = useTranslations('common')
  return (
    <span className="inline-flex items-center gap-1.5">
      {isOnline && <Wifi aria-label={t('online')} className="size-3.5 text-fg-muted" />}
      <TextLink asChild>
        <Link href={roomHref(location)} className={TARGET}>
          {location}
        </Link>
      </TextLink>
    </span>
  )
}
