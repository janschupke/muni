'use client'

import { useTranslations } from 'next-intl'
import { useReducer, useTransition } from 'react'

import { useToast } from '@/components/shell/toasts'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { createPlannedSessionAction, type PlannedOutcome } from '@/server/actions/sessions'

import type { OfferDraft } from './use-offer-draft'

interface Submission {
  /** Editing the offer, or reviewing what the server's check says will be created. */
  stage: 'edit' | 'review'
  /** Which request is out: each button says "working" only for its own. */
  sending: 'check' | 'create' | null
  /** The server's last answer: what it would refuse, or what it checked. */
  answer: PlannedOutcome | null
}

type Event =
  | { type: 'edited' }
  | { type: 'sent'; dryRun: boolean }
  | { type: 'answered'; answer: PlannedOutcome; dryRun: boolean }
  | { type: 'back' }

function next(state: Submission, event: Event): Submission {
  switch (event.type) {
    // Any change starts the check over.
    case 'edited':
      return { ...state, stage: 'edit', answer: null }
    case 'sent':
      return { ...state, sending: event.dryRun ? 'check' : 'create' }
    // A refusal goes back to editing, with what was refused; a passed check to the review.
    case 'answered':
      return {
        sending: null,
        answer: event.answer,
        stage: event.answer.ok && event.dryRun ? 'review' : 'edit',
      }
    case 'back':
      return { ...state, stage: 'edit' }
  }
}

/**
 * Sending a planner offer: a check (the same transaction, undone) that leads to the review,
 * then the create, all or nothing, which toasts and closes. `request` builds what is sent.
 */
export function useOfferSubmission(onCreated: () => void) {
  const t = useTranslations('planner.review')
  const toast = useToast()
  const afterWrite = useAfterWrite('session')
  const [pending, startTransition] = useTransition()
  const [state, dispatch] = useReducer(next, { stage: 'edit', sending: null, answer: null })

  const send = (request: ReturnType<OfferDraft['request']>) => {
    const { dryRun } = request
    dispatch({ type: 'sent', dryRun })
    startTransition(async () => {
      const answer: PlannedOutcome = await createPlannedSessionAction(request).catch(() => ({
        ok: false as const,
        problem: 'failed' as const,
        refusals: [] as [],
      }))
      dispatch({ type: 'answered', answer, dryRun })
      if (!answer.ok || dryRun) return
      afterWrite()
      toast({
        title: t('created', { id: answer.externalId, count: answer.booked }),
        action: { label: t('openSession'), href: `/sessions/${answer.externalId}` },
      })
      onCreated()
    })
  }

  return {
    ...state,
    pending,
    send,
    edited: () => {
      dispatch({ type: 'edited' })
    },
    back: () => {
      dispatch({ type: 'back' })
    },
  }
}
