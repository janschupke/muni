'use client'

import type { SessionOffer } from '@muni/domain/planner'
import { Alert } from '@muni/ui/alert'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { formatCurrency, PLACEHOLDER } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import type { OfferDraft } from './use-offer-draft'

/** Exactly what will be created and who will be booked, once the server's check passed. */
export function OfferSummary({ offer, draft }: { offer: SessionOffer; draft: OfferDraft }) {
  const t = useTranslations('planner.review')
  const { chosen, pricePerPerson } = draft
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">{t('summaryTitle')}</h3>
      <DescriptionList>
        <DescriptionItem label={t('course')}>{offer.course.name}</DescriptionItem>
        <DescriptionItem label={t('when')}>{draft.when}</DescriptionItem>
        <DescriptionItem label={t('room')}>{draft.room?.name ?? PLACEHOLDER}</DescriptionItem>
        <DescriptionItem label={t('capacity')}>{draft.seats ?? PLACEHOLDER}</DescriptionItem>
        <DescriptionItem label={t('price')}>{formatCurrency(pricePerPerson)}</DescriptionItem>
        <DescriptionItem label={t('booked')}>
          {chosen.length === 0 ? (
            t('nobody')
          ) : (
            <ul className="flex flex-col gap-0.5">
              {chosen.map(p => (
                <li key={p.externalId}>{p.name}</li>
              ))}
            </ul>
          )}
        </DescriptionItem>
        <DescriptionItem label={t('total')}>
          {formatCurrency(pricePerPerson == null ? null : pricePerPerson * chosen.length)}
        </DescriptionItem>
      </DescriptionList>
      {draft.warnings.map(w => (
        <Alert key={w} tone="warning">
          {w}
        </Alert>
      ))}
    </div>
  )
}
