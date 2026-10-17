'use client'

import {
  type AdvisorPlan,
  type PlanItem,
  seatsFree,
  type SessionChoice,
} from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { DataTable, type TablePaging } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { Select } from '@muni/ui/select'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatTimeRange } from '@muni/utils/format'
import { CalendarCheck } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import { usePaginationLabels } from '@/components/pagination-labels'

import type { Booking } from './book-dialog'
import { isProposed, type ProposedItem, RowRemedy, scheduleHref, useBookDialog } from './booking'
import { col, itemId, SessionCell, usePlanColumns } from './columns'

/** The sessions a proposed item can take: the advisor's pick, then the alternatives. */
const choicesOf = (item: ProposedItem): SessionChoice[] => [
  { session: item.proposal.session, window: item.proposal.window },
  ...item.proposal.alternatives,
]

/**
 * Trainings nobody has booked, in queue order, each with the session the advisor proposes
 * (and what it would leave uncovered) or the reason there is none and what to do about it.
 * An admin picks the rows to book and, for each, the session (the proposal or one of its
 * alternatives); booking asks first, showing who goes where and what it costs.
 */
export function ActionTable({
  items,
  total,
  paging,
  shortfall,
  asOf,
  canBook,
}: {
  /** The page the server sorted and cut. */
  items: PlanItem[]
  total: number
  paging: TablePaging
  shortfall: AdvisorPlan['shortfall']
  asOf: string
  /** Admins only: choose sessions and book. */
  canBook: boolean
}) {
  const t = useTranslations('advisor')
  const shared = usePlanColumns(asOf)
  const paginationLabels = usePaginationLabels()
  const proposed = useMemo(() => items.filter(isProposed), [items])
  // The session each row books (its id); the proposal unless the admin chose another.
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(new Map())
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { ask, dialog } = useBookDialog(() => {
    setSelected(new Set())
  })

  const sessionOf = useCallback(
    (item: ProposedItem): SessionChoice => {
      const id = chosen.get(itemId(item))
      return (
        choicesOf(item).find(c => c.session.externalId === id) ?? {
          session: item.proposal.session,
          window: item.proposal.window,
        }
      )
    },
    [chosen]
  )
  const bookingsOf = useCallback(
    (rows: ProposedItem[]): Booking[] =>
      rows.map(item => ({ item, session: sessionOf(item).session })),
    [sessionOf]
  )
  const picked = proposed.filter(i => selected.has(itemId(i)))
  const pickedCost = picked.reduce((sum, i) => sum + (sessionOf(i).session.pricePerPerson ?? 0), 0)

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor(i => i.proposal?.rank, {
          id: 'rank',
          header: t('columns.rank'),
          sortFn: 'basic',
          meta: { align: 'right', headerClassName: 'w-0' },
        }),
        shared.person,
        shared.training,
        shared.lapses,
        col.accessor(i => (isProposed(i) ? Date.parse(i.proposal.session.startsAt) : undefined), {
          id: 'proposal',
          header: t('columns.proposal'),
          sortFn: 'basic',
          cell: ({ row }) => {
            const item = row.original
            if (!canBook || !isProposed(item)) return <ProposalCell item={item} asOf={asOf} />
            const choice = sessionOf(item)
            return (
              <div className="flex min-w-56 flex-col gap-1">
                <Select
                  size="sm"
                  aria-label={t('action.sessionFor', { name: item.need.employee.name })}
                  value={choice.session.externalId}
                  onValueChange={id => {
                    setChosen(current => new Map(current).set(itemId(item), id))
                  }}
                  options={choicesOf(item).map(c => {
                    const label = t('action.choice', {
                      date: formatTimeRange(c.session.startsAt, c.session.endsAt),
                      room: c.session.room.name,
                      free: Math.max(0, seatsFree(c.session)),
                    })
                    return {
                      value: c.session.externalId,
                      label: c.window === null ? label : t('action.choiceLate', { choice: label }),
                    }
                  })}
                />
                <ChoiceFacts choice={choice} asOf={asOf} />
              </div>
            )
          },
        }),
        ...(canBook
          ? [
              col.display({
                id: 'book',
                header: () => <span className="sr-only">{t('action.book')}</span>,
                // Pinned: the session column can be wide, and booking must stay in reach.
                meta: { nowrap: true, sticky: 'right', headerClassName: 'w-0' },
                cell: ({ row }) => (
                  <RowRemedy
                    item={row.original}
                    onBook={(item, from) => {
                      ask(bookingsOf([item]), from)
                    }}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [asOf, canBook, shared, t, sessionOf, bookingsOf, ask]
  )

  if (total === 0) return <EmptyState title={t('action.empty')} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('action.rows')}</p>
      {canBook ? (
        proposed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {picked.length > 0 && (
              <Button
                onClick={() => {
                  setSelected(new Set())
                }}
              >
                {t('action.clearSelection')}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={picked.length === 0}
              onClick={event => {
                ask(bookingsOf(picked), event.currentTarget)
              }}
            >
              <CalendarCheck aria-hidden />
              {t('action.bookSelected', {
                count: picked.length,
                cost: formatCurrency(pickedCost),
              })}
            </Button>
          </div>
        )
      ) : (
        <Alert tone="info" role="none">
          {t('action.readOnly')}
        </Alert>
      )}
      {shortfall.length > 0 && (
        <Alert tone="warning" title={t('action.shortfallTitle')}>
          <ul className="mt-1 flex flex-col gap-0.5">
            {shortfall.map(s => (
              <li key={s.courseCode}>
                <TextLink asChild arrow hitArea>
                  <Link href={`/courses/${s.courseCode}`}>
                    {t('action.shortfall', { course: s.courseName, people: s.people })}
                  </Link>
                </TextLink>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <DataTable
        caption={t('views.action')}
        columns={columns}
        data={items}
        getRowId={itemId}
        paging={paging}
        paginationLabels={paginationLabels}
        selection={
          canBook
            ? {
                selected,
                onSelectedChange: setSelected,
                isRowSelectable: isProposed,
                rowLabel: i =>
                  t('action.selectRow', { name: i.need.employee.name, course: i.need.course.name }),
                pageLabel: t('action.selectPage'),
              }
            : undefined
        }
      />
      {dialog}
    </div>
  )
}

/** Under a chosen session: how full it is, and whether it ends before the training lapses. */
function ChoiceFacts({ choice, asOf }: { choice: SessionChoice; asOf: string }) {
  const t = useTranslations('advisor.action')
  const { session, window } = choice
  return (
    <>
      <span className="text-xs text-fg-subtle tabular-nums">
        {t('fill', {
          booked: session.unnamedBookings + session.assigned.length,
          capacity: session.capacity,
        })}
      </span>
      {window === null ? (
        <span className="text-xs text-fg-muted">{t('inTime')}</span>
      ) : (
        <span className="text-xs text-warning-fg">
          {window.from !== null && window.from > asOf && window.days !== null
            ? t('gap', { days: window.days })
            : window.until !== null && t('coveredOn', { until: formatDate(window.until) })}
        </span>
      )}
    </>
  )
}

/** The proposed session with its fill and the gap it would leave, or the reason there is none. */
function ProposalCell({ item, asOf }: { item: PlanItem; asOf: string }) {
  const t = useTranslations('advisor.action')
  const { proposal } = item
  if (proposal === null) return null
  if (proposal.kind === 'NONE') {
    const todo =
      proposal.reason === 'CONFLICT'
        ? { href: `/employees/${item.need.employee.externalId}`, label: t('todo.bookings') }
        : { href: scheduleHref(item), label: t('todo.schedule') }
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="neutral">{t(`reasons.${proposal.reason}`)}</Badge>
        <TextLink asChild className="text-xs" arrow hitArea>
          <Link href={todo.href}>{todo.label}</Link>
        </TextLink>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <SessionCell session={proposal.session} employee={item.need.employee.externalId} />
      <ChoiceFacts choice={proposal} asOf={asOf} />
    </div>
  )
}
