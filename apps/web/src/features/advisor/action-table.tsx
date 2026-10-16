'use client'

import type { AdvisorPlan, PlanItem, Proposal } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { DataTable } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { TextLink } from '@muni/ui/text-link'
import { toZonedParts } from '@muni/utils/dates'
import { formatCurrency, formatDate } from '@muni/utils/format'
import { ArrowRight, CalendarCheck, CalendarPlus } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { col, itemId, SessionCell, usePaginationLabels, usePlanColumns } from './columns'

type SessionProposal = Extract<Proposal, { kind: 'SESSION' }>
export type ProposedItem = PlanItem & { proposal: SessionProposal }

const isProposed = (i: PlanItem): i is ProposedItem => i.proposal?.kind === 'SESSION'

/**
 * Trainings nobody has booked, in queue order, each with the session the advisor proposes
 * (and what it would leave uncovered) or the reason there is none and what to do about it.
 */
export function ActionTable({
  items,
  shortfall,
  cost,
  asOf,
  onSave,
  pending,
}: {
  items: PlanItem[]
  shortfall: AdvisorPlan['shortfall']
  cost: number
  asOf: string
  /** Signed-in only: saves proposals as bookings. */
  onSave?: ((items: ProposedItem[]) => void) | undefined
  pending: boolean
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const shared = usePlanColumns(asOf)
  const paginationLabels = usePaginationLabels()
  const proposed = useMemo(() => items.filter(isProposed), [items])

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
          cell: ({ row }) => <ProposalCell item={row.original} asOf={asOf} />,
        }),
        ...(onSave
          ? [
              col.display({
                id: 'save',
                header: () => <span className="sr-only">{t('action.save')}</span>,
                meta: { nowrap: true, headerClassName: 'w-0' },
                cell: ({ row }) => {
                  const item = row.original
                  if (!isProposed(item)) return null
                  return (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        onSave([item])
                      }}
                      aria-label={t('action.saveOne', {
                        name: item.need.employee.name,
                        session: `${item.proposal.session.courseName}, ${formatDate(toZonedParts(item.proposal.session.startsAt).date, locale)}`,
                      })}
                    >
                      <CalendarPlus aria-hidden />
                      {t('action.save')}
                    </Button>
                  )
                },
              }),
            ]
          : []),
      ]),
    [asOf, locale, onSave, pending, shared, t]
  )

  if (items.length === 0) return <EmptyState title={t('action.empty')} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('action.rows')}</p>
      {onSave ? (
        proposed.length > 0 && (
          <div>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                onSave(proposed)
              }}
            >
              <CalendarCheck aria-hidden />
              {t('action.saveAll', {
                count: proposed.length,
                cost: formatCurrency(cost, locale),
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
      />
    </div>
  )
}

/** The proposed session with its fill and the gap it would leave, or the reason there is none. */
function ProposalCell({ item, asOf }: { item: PlanItem; asOf: string }) {
  const t = useTranslations('advisor.action')
  const locale = useLocale()
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
  const { session, window } = proposal
  const booked = session.unnamedBookings + session.assigned.length
  return (
    <div className="flex flex-col gap-0.5">
      <SessionCell session={session} />
      <span className="text-xs text-fg-subtle tabular-nums">
        {t('fill', { booked, capacity: session.capacity })}
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
    </div>
  )
}
