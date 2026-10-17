'use client'

import {
  type AdvisorPlan,
  type PlanItem,
  type Proposal,
  seatsFree,
  type SessionChoice,
} from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { DataTable } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { Select } from '@muni/ui/select'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatTimeRange } from '@muni/utils/format'
import { ArrowRight, CalendarCheck, CalendarPlus } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import type { Booking } from './book-dialog'
import { col, itemId, SessionCell, usePaginationLabels, usePlanColumns } from './columns'

// Loaded when needed: the dialog opens when rows are booked.
const BookDialog = dynamic(() => import('./book-dialog').then(m => m.BookDialog))

type SessionProposal = Extract<Proposal, { kind: 'SESSION' }>
export type ProposedItem = PlanItem & { proposal: SessionProposal }

const isProposed = (i: PlanItem): i is ProposedItem => i.proposal?.kind === 'SESSION'

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
  shortfall,
  asOf,
  canBook,
}: {
  items: PlanItem[]
  shortfall: AdvisorPlan['shortfall']
  asOf: string
  /** Admins only: choose sessions and book. */
  canBook: boolean
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const shared = usePlanColumns(asOf)
  const paginationLabels = usePaginationLabels()
  const proposed = useMemo(() => items.filter(isProposed), [items])
  // The session each row books (its id); the proposal unless the admin chose another.
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(new Map())
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [asking, setAsking] = useState<{ bookings: Booking[]; from: HTMLElement } | null>(null)

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
                      date: formatTimeRange(c.session.startsAt, c.session.endsAt, locale),
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
                cell: ({ row }) => {
                  const item = row.original
                  if (!isProposed(item)) return null
                  return (
                    <Button
                      size="sm"
                      onClick={event => {
                        setAsking({ bookings: bookingsOf([item]), from: event.currentTarget })
                      }}
                      aria-label={t('action.bookOne', { name: item.need.employee.name })}
                    >
                      <CalendarPlus aria-hidden />
                      {t('action.book')}
                    </Button>
                  )
                },
              }),
            ]
          : []),
      ]),
    [asOf, locale, canBook, shared, t, sessionOf, bookingsOf]
  )

  if (items.length === 0) return <EmptyState title={t('action.empty')} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('action.rows')}</p>
      {canBook ? (
        proposed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={picked.length === 0}
              onClick={event => {
                setAsking({ bookings: bookingsOf(picked), from: event.currentTarget })
              }}
            >
              <CalendarCheck aria-hidden />
              {t('action.bookSelected', {
                count: picked.length,
                cost: formatCurrency(pickedCost, locale),
              })}
            </Button>
            {picked.length < proposed.length && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(new Set(proposed.map(itemId)))
                }}
              >
                {t('action.selectAll', { count: proposed.length })}
              </Button>
            )}
            {picked.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(new Set())
                }}
              >
                {t('action.clearSelection')}
              </Button>
            )}
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
                <TextLink asChild tone="inherit">
                  <Link
                    href={`/courses/${s.courseCode}`}
                    className="inline-flex items-center gap-1"
                  >
                    {t('action.shortfall', { course: s.courseName, people: s.people })}
                    <ArrowRight aria-hidden className="size-3.5" />
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
        initialSorting={[{ id: 'rank', desc: false }]}
        pageSize={25}
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
      {asking && (
        <BookDialog
          open
          bookings={asking.bookings}
          onOpenChange={open => {
            if (!open) setAsking(null)
          }}
          returnFocusTo={() => asking.from}
          onBooked={() => {
            setSelected(new Set())
          }}
        />
      )}
    </div>
  )
}

/** Under a chosen session: how full it is, and whether it ends before the training lapses. */
function ChoiceFacts({ choice, asOf }: { choice: SessionChoice; asOf: string }) {
  const t = useTranslations('advisor.action')
  const locale = useLocale()
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
            : window.until !== null && t('coveredOn', { until: formatDate(window.until, locale) })}
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
        : { href: `/courses/${item.need.course.code}`, label: t('todo.schedule') }
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="neutral">{t(`reasons.${proposal.reason}`)}</Badge>
        <TextLink asChild className="text-xs">
          <Link href={todo.href} className="inline-flex items-center gap-1">
            {todo.label}
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        </TextLink>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <SessionCell session={proposal.session} />
      <ChoiceFacts choice={proposal} asOf={asOf} />
    </div>
  )
}
