'use client'

import { type AdvisorPlan, isProposed, type PlanItem } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { DataTable, type TablePaging } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { TextLink } from '@muni/ui/text-link'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { usePaginationLabels } from '@/components/pagination-labels'
import { itemId } from '@/features/bookings/book-dialog'
import { ChoiceFacts, SessionCell, UnplacedCell } from '@/features/bookings/choice-cells'

import { useBookSelection } from './book-selection'
import { col, usePlanColumns } from './columns'

/**
 * Trainings nobody has booked, in queue order, each with the session the advisor proposes
 * for it (and what it would leave uncovered) or the reason there is none and what to do about
 * it. An admin books a row, or picks rows and books them together; the dialog lets each take
 * another session and shows who goes where and what it costs.
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
  /** Admins only: book. */
  canBook: boolean
}) {
  const t = useTranslations('advisor')
  const shared = usePlanColumns(asOf)
  const paginationLabels = usePaginationLabels()
  const booking = useBookSelection({ items, asOf, canBook })

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
        ...booking.columns,
      ]),
    [asOf, shared, t, booking.columns]
  )

  if (total === 0) return <EmptyState title={t('action.empty')} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('action.rows')}</p>
      {canBook ? (
        booking.bar
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
        selection={booking.selection}
      />
      {booking.dialog}
    </div>
  )
}

/** The proposed session with its fill and the gap it would leave, or the reason there is none. */
function ProposalCell({ item, asOf }: { item: PlanItem; asOf: string }) {
  if (!isProposed(item)) return <UnplacedCell item={item} />
  return (
    <div className="flex flex-col gap-0.5">
      <SessionCell session={item.proposal.session} employee={item.need.employee.externalId} />
      <ChoiceFacts choice={item.proposal} asOf={asOf} />
    </div>
  )
}
