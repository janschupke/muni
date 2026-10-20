'use client'

import { formatCurrency } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import type { SaveConfirmation } from '@/components/form/form-shell'

import type { useSessionDraft } from './session-draft'
import type { SessionDefaults } from './session-form'

/**
 * What saving an edited session asks first: moving its bookings to another course, or
 * charging them another price, does more than the form shows, so the form says what happens
 * to the people on it. Nothing to ask for a new session or one nobody is booked on by name.
 */
export function useSessionConfirm({
  draft,
  defaults,
  isNew,
  named,
}: {
  draft: ReturnType<typeof useSessionDraft>
  defaults: SessionDefaults
  isNew: boolean
  named: number
}) {
  const tq = useTranslations('forms.session.confirm')
  const { courseId, sameOffer, price, course } = draft
  return (): SaveConfirmation | null => {
    if (isNew || named === 0) return null
    const moving = courseId !== defaults.courseId
    const repriced = !sameOffer && price !== defaults.pricePerPerson
    if (!moving && !repriced) return null
    return {
      title: moving ? tq('courseTitle') : tq('priceTitle'),
      body: (
        <>
          {moving && <p>{tq('courseBody', { count: named, course: course?.name ?? '' })}</p>}
          {repriced && (
            <p>
              {tq('priceBody', {
                count: named,
                price: formatCurrency(price),
                was: formatCurrency(defaults.pricePerPerson),
              })}
            </p>
          )}
        </>
      ),
      confirmLabel: moving ? tq('courseConfirm') : tq('priceConfirm'),
      tone: 'primary',
    }
  }
}
