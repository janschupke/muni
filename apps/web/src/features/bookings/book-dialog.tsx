'use client'

import { type PlanItem } from '@muni/domain/advisor'
import { formatCurrency, formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { ConfirmDialog, type ConfirmOutcome } from '@/components/feedback/confirm-dialog'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { applyAssignmentsAction } from '@/server/actions/assignments'

import { BookingBody } from './booking-table'
import { type BookingDraft, useBookingDraft } from './use-booking-draft'

/**
 * The decision before booking: each training with the session it goes on (the advisor's
 * proposal, or one of the alternatives picked here), its price, and the total. With several,
 * each can be left out. A session that would get more people than it has free seats stops the
 * confirm until some are moved or left out. A training with no session to take says why and
 * how to get one. The server checks every booking again as it saves.
 */
export function BookDialog({
  items,
  asOf,
  source,
  open,
  onOpenChange,
  returnFocusTo,
  onBooked,
}: {
  /** The trainings to book; `loading` while they are read, null when the read failed. */
  items: PlanItem[] | 'loading' | null
  asOf: string
  /** Where the booking comes from: the advisor's tables, or a record's page. */
  source: 'ADVISOR' | 'MANUAL'
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
  /** Some (or all) were booked: the caller clears its selection. */
  onBooked: () => void
}) {
  const t = useTranslations('bookings.dialog')
  const tr = useTranslations('advisor.outcome')
  const afterWrite = useAfterWrite('booking')
  const rows = Array.isArray(items) ? items : []
  const draft = useBookingDraft(rows)
  const { bookings, cost, over } = draft

  const confirm = async (): Promise<ConfirmOutcome> => {
    const result = await applyAssignmentsAction(
      bookings.map(b => ({
        sessionExternalId: b.session.externalId,
        employeeExternalId: b.item.need.employee.externalId,
        source,
      }))
    )
    // Nothing written: turned away, or the server failed.
    if (!result.ok) return { kind: 'refused', message: tr(`reasons.${result.problem}`) }
    if (result.applied > 0) {
      afterWrite()
      onBooked()
    }
    const failures = <FailureList failed={result.failed} bookings={bookings} />
    const toast = { title: t('done', { count: result.applied }) }
    if (result.failed.length === 0) return { kind: 'done', toast }
    if (result.applied > 0)
      return {
        kind: 'partial',
        toast,
        message: (
          <>
            {t('partial', { applied: result.applied, failed: result.failed.length })}
            {failures}
          </>
        ),
      }
    return {
      kind: 'refused',
      message: (
        <>
          {t('refused')}
          {failures}
        </>
      ),
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      confirmLabel={t('confirm', { count: bookings.length, cost: formatCurrency(cost) })}
      disabled={bookings.length === 0 || over.length > 0}
      onConfirm={confirm}
      returnFocusTo={returnFocusTo}
      className="max-w-4xl"
    >
      <p className="text-sm text-fg-muted">{t('body')}</p>
      <BookingBody items={items} draft={draft} asOf={asOf} />
    </ConfirmDialog>
  )
}

/** The bookings the server refused, each named with why. */
function FailureList({
  failed,
  bookings,
}: {
  failed: Extract<Awaited<ReturnType<typeof applyAssignmentsAction>>, { ok: true }>['failed']
  bookings: BookingDraft['bookings']
}) {
  const tr = useTranslations('advisor.outcome')
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {failed.map(f => {
        const booking = bookings.find(
          b =>
            b.item.need.employee.externalId === f.employeeExternalId &&
            b.session.externalId === f.sessionExternalId
        )
        return (
          <li key={`${f.employeeExternalId}|${f.sessionExternalId}`}>
            {tr('failure', {
              name: booking?.item.need.employee.name ?? f.employeeExternalId,
              session: booking
                ? `${booking.session.courseName}, ${formatSessionTime(booking.session)}`
                : f.sessionExternalId,
              reason: tr(`reasons.${f.reason}`),
            })}
          </li>
        )
      })}
    </ul>
  )
}
