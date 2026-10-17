'use client'

import type { RoomOption } from '@muni/db/repositories'
import type { SessionOffer } from '@muni/domain/planner'
import { Button } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { useToast } from '@/components/toasts'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { createPlannedSessionAction, type PlannedOutcome } from '@/server/actions/sessions'

import { OfferEdit } from './offer-edit'
import { OfferSummary } from './offer-summary'
import { useOfferDraft } from './use-offer-draft'

/**
 * A planner offer turned into a session: everything can change (day, times, room, seats,
 * price, who is booked), then the server checks it all without writing (the same
 * transaction, undone), the user reviews exactly what will be created, and confirms. Only
 * then is the session created and the people booked, all or nothing.
 */
export function OfferReview({
  offer,
  rooms,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  offer: SessionOffer
  rooms: readonly RoomOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
}) {
  const t = useTranslations('planner.review')
  const tc = useTranslations('common')
  const toast = useToast()
  const afterWrite = useAfterWrite()
  const [pending, startTransition] = useTransition()
  // Which request is out: each button says "working" only for its own.
  const [sending, setSending] = useState<'check' | 'create' | null>(null)
  const [stage, setStage] = useState<'edit' | 'review'>('edit')
  const [answer, setAnswer] = useState<PlannedOutcome | null>(null)
  // Any change starts the check over.
  const draft = useOfferDraft(offer, rooms, () => {
    setAnswer(null)
    setStage('edit')
  })

  const send = (dryRun: boolean) => {
    setSending(dryRun ? 'check' : 'create')
    startTransition(async () => {
      const result: PlannedOutcome = await createPlannedSessionAction(draft.request(dryRun)).catch(
        () => ({ ok: false as const, problem: 'failed' as const, refusals: [] as [] })
      )
      setSending(null)
      setAnswer(result)
      if (!result.ok) {
        setStage('edit')
        return
      }
      if (dryRun) {
        setStage('review')
        return
      }
      afterWrite()
      toast({
        title: t('created', { id: result.externalId, count: result.booked }),
        action: { label: t('openSession'), href: `/sessions/${result.externalId}` },
      })
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!pending) onOpenChange(next)
      }}
      title={t('title', { course: offer.course.name })}
      description={t('intro')}
      closeLabel={tc('close')}
      returnFocusTo={returnFocusTo}
      className="max-w-3xl"
      footer={
        stage === 'edit' ? (
          <>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {tc('keepAsIs')}
            </Button>
            <Button
              variant="primary"
              disabled={!draft.valid || pending}
              onClick={() => {
                send(true)
              }}
            >
              {sending === 'check' ? t('checking') : t('check')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setStage('edit')
              }}
            >
              {t('back')}
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                send(false)
              }}
            >
              {sending === 'create' ? t('creating') : t('confirm', { count: draft.chosen.length })}
            </Button>
          </>
        )
      }
    >
      {stage === 'review' ? (
        <OfferSummary offer={offer} draft={draft} />
      ) : (
        <OfferEdit offer={offer} rooms={rooms} draft={draft} answer={answer} />
      )}
    </Dialog>
  )
}
