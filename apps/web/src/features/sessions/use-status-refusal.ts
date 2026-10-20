'use client'

import { useTranslations } from 'next-intl'

import type { StatusOutcome } from '@/server/actions/sessions'

type Refusal = Extract<StatusOutcome, { ok: false }>['reason']

/** Why a session's status did not change (cancelling or reinstating it), as a sentence. */
export function useStatusRefusal(act: 'cancel' | 'reinstate') {
  const t = useTranslations(act === 'cancel' ? 'sessions.cancel' : 'sessions.reinstate')
  const errors = useTranslations('forms.errors')
  const reasons = useTranslations('advisor.outcome.reasons')
  return (reason: Refusal): string => {
    switch (reason) {
      case 'UNCHANGED':
      case 'STARTED':
        return t(`refused.${reason}`)
      case 'NOT_FOUND':
        return reasons('SESSION_NOT_FOUND')
      case 'unauthorized':
      case 'rate_limited':
      case 'invalid':
      case 'failed':
        return reasons(reason)
      default:
        // What keeps it from being planned there now: the room, its seats, its people.
        return errors(reason.toLowerCase() as Lowercase<typeof reason>)
    }
  }
}
