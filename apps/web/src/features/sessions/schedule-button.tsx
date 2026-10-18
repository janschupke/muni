'use client'

import type { ScheduleBlock } from '@muni/domain/sessions'
import { Button } from '@muni/ui/button'
import { UnavailableButton } from '@muni/ui/unavailable-button'
import { CalendarPlus } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

/**
 * The one way to schedule a session of a course, from wherever the course shows: the course
 * list and page, a room's course fit, a provider's offerings. It opens the session form with
 * what the place knows (the room, the provider). When a session of the course cannot be
 * scheduled from there (`scheduleBlock`), it stays in its place, dimmed, and says why.
 */
export function ScheduleSessionButton({
  course,
  room,
  provider,
  block,
  label,
  primary = false,
}: {
  /** The course's code. */
  course: string
  room?: string | undefined
  provider?: string | undefined
  block: ScheduleBlock | null
  /** Its accessible name, where several show at once: "Schedule a session of BOZP". */
  label?: string | undefined
  /** The page's own primary action (the course page). */
  primary?: boolean | undefined
}) {
  const t = useTranslations('sessions.schedule')
  const content = (
    <>
      <CalendarPlus aria-hidden />
      {t('action')}
    </>
  )
  if (block)
    return (
      <UnavailableButton
        size={primary ? 'md' : 'sm'}
        aria-label={label}
        reason={t(`blocked.${block}`)}
      >
        {content}
      </UnavailableButton>
    )
  const query = new URLSearchParams({
    ...(room && { room }),
    ...(provider && { provider }),
  }).toString()
  return (
    <Button asChild size={primary ? 'md' : 'sm'} variant={primary ? 'primary' : 'secondary'}>
      <Link
        href={`/courses/${encodeURIComponent(course)}/sessions/new${query ? `?${query}` : ''}`}
        aria-label={label}
      >
        {content}
      </Link>
    </Button>
  )
}
