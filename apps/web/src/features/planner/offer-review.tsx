'use client'

import type { RoomOption } from '@muni/db/repositories'
import type { SessionOffer } from '@muni/domain/planner'
import { Button, CancelButton } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { useTranslations } from 'next-intl'

import { OfferEdit } from './offer-edit'
import { OfferSummary } from './offer-summary'
import { useOfferDraft } from './use-offer-draft'
import { useOfferSubmission } from './use-offer-submission'

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
  const submission = useOfferSubmission(() => {
    onOpenChange(false)
  })
  const { stage, sending, answer, pending } = submission
  const draft = useOfferDraft(offer, rooms, submission.edited)

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
            <CancelButton
              disabled={pending}
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {tc('keepAsIs')}
            </CancelButton>
            <Button
              variant="primary"
              disabled={!draft.valid || pending}
              onClick={() => {
                submission.send(draft.request(true))
              }}
            >
              {sending === 'check' ? t('checking') : t('check')}
            </Button>
          </>
        ) : (
          <>
            <CancelButton
              disabled={pending}
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {tc('keepAsIs')}
            </CancelButton>
            <Button disabled={pending} onClick={submission.back}>
              {t('back')}
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                submission.send(draft.request(false))
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
