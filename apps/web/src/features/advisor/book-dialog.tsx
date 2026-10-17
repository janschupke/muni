'use client'

import { type AdvisorSession, seatsFree } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { formatCurrency, formatTimeRange, PLACEHOLDER } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { ConfirmDialog, type ConfirmOutcome } from '@/components/confirm-dialog'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { applyAssignmentsAction } from '@/server/actions/assignments'

import type { ProposedItem } from './booking'

/** One person to book, on the session the admin chose for them. */
export interface Booking {
  item: ProposedItem
  session: AdvisorSession
}

/**
 * The decision before booking: who goes on which session, at what price, and in total. A
 * session that would get more people than it has free seats stops the confirm until some
 * are moved or left out. The server checks every booking again as it saves.
 */
export function BookDialog({
  bookings,
  open,
  onOpenChange,
  returnFocusTo,
  onBooked,
}: {
  bookings: Booking[]
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
  /** Some (or all) were booked: the caller clears its selection. */
  onBooked: () => void
}) {
  const t = useTranslations('advisor.action.dialog')
  const tr = useTranslations('advisor.outcome')
  const afterWrite = useAfterWrite('booking')
  const when = (s: AdvisorSession) => formatTimeRange(s.startsAt, s.endsAt)
  const cost = bookings.reduce((sum, b) => sum + (b.session.pricePerPerson ?? 0), 0)

  const bySession = new Map<string, { session: AdvisorSession; count: number }>()
  for (const { session } of bookings) {
    const entry = bySession.get(session.externalId) ?? { session, count: 0 }
    bySession.set(session.externalId, { ...entry, count: entry.count + 1 })
  }
  const over = [...bySession.values()].filter(({ session, count }) => count > seatsFree(session))

  const confirm = async (): Promise<ConfirmOutcome> => {
    const result = await applyAssignmentsAction(
      bookings.map(b => ({
        sessionExternalId: b.session.externalId,
        employeeExternalId: b.item.need.employee.externalId,
        source: 'ADVISOR' as const,
      }))
    )
    // Nothing written: turned away, or the server failed.
    if (!result.ok) return { kind: 'refused', message: tr(`reasons.${result.problem}`) }
    if (result.applied > 0) {
      afterWrite()
      onBooked()
    }
    const failures = (
      <ul className="mt-1 flex flex-col gap-0.5">
        {result.failed.map(f => {
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
                  ? `${booking.session.courseName}, ${when(booking.session)}`
                  : f.sessionExternalId,
                reason: tr(`reasons.${f.reason}`),
              })}
            </li>
          )
        })}
      </ul>
    )
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
      title={t('title', { count: bookings.length })}
      confirmLabel={t('confirm', { count: bookings.length })}
      disabled={bookings.length === 0 || over.length > 0}
      onConfirm={confirm}
      returnFocusTo={returnFocusTo}
      className="max-w-3xl"
    >
      <p className="text-sm text-fg-muted">{t('body')}</p>
      <TableContainer paging="the bookings being confirmed, picked by hand">
        <Table density="compact" aria-label={t('table')}>
          <THead>
            <tr>
              <Th>{t('person')}</Th>
              <Th>{t('training')}</Th>
              <Th>{t('session')}</Th>
              <Th align="right">{t('price')}</Th>
            </tr>
          </THead>
          <TBody>
            {bookings.map(({ item, session }) => (
              <Tr key={`${item.need.employee.externalId}|${item.need.course.code}`}>
                <Td>{item.need.employee.name}</Td>
                <Td>{item.need.course.name}</Td>
                <Td nowrap>
                  {when(session)} · {session.room.name}
                </Td>
                <Td align="right" nowrap>
                  {session.pricePerPerson === null
                    ? PLACEHOLDER
                    : formatCurrency(session.pricePerPerson)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
      <p className="text-right text-sm font-medium tabular-nums">
        {t('total', { cost: formatCurrency(cost) })}
      </p>
      {over.map(({ session, count }) => (
        <Alert key={session.externalId} tone="danger">
          {t('over', {
            session: `${session.courseName}, ${when(session)}`,
            count,
            free: Math.max(0, seatsFree(session)),
          })}
        </Alert>
      ))}
    </ConfirmDialog>
  )
}
