'use client'

import { type PlanItem, seatsFree } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { EmptyState } from '@muni/ui/empty-state'
import { Table, TableContainer, TBody, Th, THead } from '@muni/ui/table'
import { formatCurrency, formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { BookingRow } from './booking-row'
import { type BookingDraft, itemId } from './use-booking-draft'

/** The trainings with their sessions, once read: or that they are loading, failed, or none. */
export function BookingBody({
  items,
  draft,
  asOf,
}: {
  items: PlanItem[] | 'loading' | null
  draft: BookingDraft
  asOf: string
}) {
  const t = useTranslations('bookings.dialog')
  const tc = useTranslations('common')
  if (items === 'loading')
    return (
      <p role="status" className="text-sm text-fg-muted">
        {t('loading')}
      </p>
    )
  if (items === null) return <Alert tone="danger">{tc('failed')}</Alert>
  if (items.length === 0) return <EmptyState variant="inline" title={t('nothing')} />
  return (
    <>
      <TableContainer paging="the trainings being booked, as many as the dialog was opened for">
        <Table density="compact" aria-label={t('table')}>
          <THead>
            <tr>
              {draft.pickable && (
                <Th className="w-0">
                  <span className="sr-only">{t('includeColumn')}</span>
                </Th>
              )}
              <Th>{t('person')}</Th>
              <Th>{t('training')}</Th>
              <Th>{t('session')}</Th>
              <Th align="right">{t('price')}</Th>
            </tr>
          </THead>
          <TBody>
            {items.map(item => (
              <BookingRow key={itemId(item)} item={item} draft={draft} asOf={asOf} />
            ))}
          </TBody>
        </Table>
      </TableContainer>
      <p className="text-right text-sm font-medium tabular-nums">
        {t('total', { cost: formatCurrency(draft.cost) })}
      </p>
      {draft.over.map(({ session, count }) => (
        <Alert key={session.externalId} tone="danger">
          {t('over', {
            session: `${session.courseName}, ${formatSessionTime(session)}`,
            count,
            free: Math.max(0, seatsFree(session)),
          })}
        </Alert>
      ))}
    </>
  )
}
