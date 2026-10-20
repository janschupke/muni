'use client'

import {
  choicesOf,
  isProposed,
  type PlanItem,
  type ProposedItem,
  seatsFree,
  type SessionChoice,
  summarizeBookings,
} from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { SelectBox } from '@muni/ui/checkbox'
import { EmptyState } from '@muni/ui/empty-state'
import { Select } from '@muni/ui/select'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { formatCurrency, formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ComplianceBadge } from '@/components/badges/status-badges'
import { ConfirmDialog, type ConfirmOutcome } from '@/components/feedback/confirm-dialog'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { applyAssignmentsAction } from '@/server/actions/assignments'

import { ChoiceFacts, UnplacedCell } from './choice-cells'

/** A training's key: one person, one course. */
export const itemId = (i: PlanItem) => `${i.need.employee.externalId}|${i.need.course.code}`

/** The session a training books: the one chosen for it, else the advisor's proposal. */
const choiceOf = (item: ProposedItem, chosen: ReadonlyMap<string, string>): SessionChoice =>
  choicesOf(item).find(c => c.session.externalId === chosen.get(itemId(item))) ?? {
    session: item.proposal.session,
    window: item.proposal.window,
  }

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
  const tb = useTranslations('bookings')
  const tr = useTranslations('advisor.outcome')
  const tc = useTranslations('common')
  const afterWrite = useAfterWrite('booking')
  // The session each training books (its id), when not the proposal; the ones left out.
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(new Map())
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())

  const rows = Array.isArray(items) ? items : []
  const proposed = rows.filter(isProposed)
  const bookings = proposed
    .filter(item => !left.has(itemId(item)))
    .map(item => ({ item, session: choiceOf(item, chosen).session }))
  const { cost, over } = summarizeBookings(bookings.map(b => b.session))

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
                  ? `${booking.session.courseName}, ${formatSessionTime(booking.session)}`
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

  // Leaving one out is a choice only among several.
  const pickable = proposed.length > 1

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
      {items === 'loading' ? (
        <p role="status" className="text-sm text-fg-muted">
          {t('loading')}
        </p>
      ) : items === null ? (
        <Alert tone="danger">{tc('failed')}</Alert>
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title={t('nothing')} />
      ) : (
        <>
          <TableContainer paging="the trainings being booked, as many as the dialog was opened for">
            <Table density="compact" aria-label={t('table')}>
              <THead>
                <tr>
                  {pickable && (
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
                {rows.map(item => {
                  const id = itemId(item)
                  const { employee, course } = item.need
                  const choice = isProposed(item) ? choiceOf(item, chosen) : null
                  return (
                    <Tr key={id}>
                      {pickable && (
                        <Td>
                          {choice && (
                            <SelectBox
                              checked={!left.has(id)}
                              onCheckedChange={checked => {
                                setLeft(current => {
                                  const next = new Set(current)
                                  if (checked) next.delete(id)
                                  else next.add(id)
                                  return next
                                })
                              }}
                              aria-label={t('include', {
                                name: employee.name,
                                course: course.name,
                              })}
                            />
                          )}
                        </Td>
                      )}
                      <Td nowrap>{employee.name}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          {course.name}
                          <ComplianceBadge status={item.need.status} />
                        </div>
                      </Td>
                      <Td>
                        {choice && isProposed(item) ? (
                          <div className="flex min-w-60 flex-col gap-1">
                            <Select
                              size="sm"
                              aria-label={tb('sessionFor', { name: employee.name })}
                              value={choice.session.externalId}
                              onValueChange={sessionId => {
                                setChosen(current => new Map(current).set(id, sessionId))
                              }}
                              options={choicesOf(item).map(c => {
                                const label = tb('choice', {
                                  date: formatSessionTime(c.session),
                                  room: c.session.room.name,
                                  free: Math.max(0, seatsFree(c.session)),
                                })
                                return {
                                  value: c.session.externalId,
                                  label:
                                    c.window === null ? label : tb('choiceLate', { choice: label }),
                                }
                              })}
                            />
                            <ChoiceFacts choice={choice} asOf={asOf} />
                          </div>
                        ) : (
                          <UnplacedCell item={item} />
                        )}
                      </Td>
                      <Td align="right" nowrap>
                        {formatCurrency(choice?.session.pricePerPerson)}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </TableContainer>
          <p className="text-right text-sm font-medium tabular-nums">
            {t('total', { cost: formatCurrency(cost) })}
          </p>
          {over.map(({ session, count }) => (
            <Alert key={session.externalId} tone="danger">
              {t('over', {
                session: `${session.courseName}, ${formatSessionTime(session)}`,
                count,
                free: Math.max(0, seatsFree(session)),
              })}
            </Alert>
          ))}
        </>
      )}
    </ConfirmDialog>
  )
}
