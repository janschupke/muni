import { sessionPhase, startsLater } from '@muni/domain/sessions'

import type { Target } from '@/components/views/record-actions'

import { SessionStatusButton } from './session-status-button'

/**
 * What an admin can do with a session where it stands (`sessionPhase`): one still to start is
 * cancelled, not archived; one under way is left alone; one over or cancelled can be archived,
 * and a cancelled one still to start planned again (on its page; `row` is a table's row).
 */
export function sessionTarget(
  session: {
    id: string
    externalId: string
    courseName: string
    status: 'PLANNED' | 'CANCELLED'
    startsAt: string
    endsAt: string
    bookings: readonly unknown[]
  },
  { now = new Date(), row = false }: { now?: Date; row?: boolean } = {}
): Target {
  const name = `${session.externalId} · ${session.courseName}`
  const phase = sessionPhase(session, now)
  const act = (act: 'cancel' | 'reinstate') => (
    <SessionStatusButton
      act={act}
      externalId={session.externalId}
      name={name}
      named={session.bookings.length}
      compact={row}
    />
  )
  return {
    kind: 'session',
    id: session.id,
    name,
    editHref: `/sessions/${session.externalId}/edit`,
    archivable: phase === 'ENDED' || phase === 'CANCELLED',
    lead:
      phase === 'AHEAD'
        ? act('cancel')
        : phase === 'CANCELLED' && !row && startsLater(session, now)
          ? act('reinstate')
          : null,
  }
}
