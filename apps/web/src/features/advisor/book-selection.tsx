'use client'

import { isProposed, type PlanItem } from '@muni/domain/advisor'
import { Button } from '@muni/ui/button'
import type { RowSelection } from '@muni/ui/data-table'
import { CalendarCheck, CalendarPlus } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type ReactNode, useMemo, useState } from 'react'

import { hiddenHeader } from '@/components/table/table-columns'
import { BookButton } from '@/features/bookings/book-button'
import { scheduleHref } from '@/features/bookings/choice-cells'
import { useBookDialog } from '@/features/bookings/use-book-dialog'
import { itemId } from '@/features/bookings/use-booking-draft'

import { col } from './columns'

/**
 * Booking from an advisor table, the same in every tab: a row with a proposed session books
 * it ("Book…"), a row with none schedules a new session of the course; several rows are
 * picked and booked together. Either way the dialog shows each training's session (the
 * proposal or an alternative, chosen there) and the cost before anything is saved.
 */
export function useBookSelection({
  items,
  asOf,
  canBook,
}: {
  /** The page on screen: what can be picked. */
  items: PlanItem[]
  asOf: string
  canBook: boolean
}): {
  /** The table's row selection (admins only). */
  selection: RowSelection<PlanItem> | undefined
  /** The column that books one row (admins only), pinned to the right. */
  columns: ReturnType<typeof col.display>[]
  /** "Book N selected…", above the table. */
  bar: ReactNode
  dialog: ReactNode
} {
  const t = useTranslations('advisor.action')
  const tc = useTranslations('advisor.columns')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { ask, dialog } = useBookDialog(() => {
    setSelected(new Set())
  })
  const proposed = useMemo(() => items.filter(isProposed), [items])
  const picked = proposed.filter(i => selected.has(itemId(i)))

  const columns = useMemo(
    () =>
      canBook
        ? [
            col.display({
              id: 'book',
              header: hiddenHeader(tc('remedy')),
              // Pinned: the session column can be wide, and booking must stay in reach.
              meta: { nowrap: true, sticky: 'right', headerClassName: 'w-0' },
              cell: ({ row }) => (
                <RowRemedy
                  item={row.original}
                  onBook={from => {
                    ask([row.original], asOf, from)
                  }}
                />
              ),
            }),
          ]
        : [],
    [canBook, tc, ask, asOf]
  )

  return {
    selection: canBook
      ? {
          selected,
          onSelectedChange: setSelected,
          isRowSelectable: isProposed,
          rowLabel: i => t('selectRow', { name: i.need.employee.name, course: i.need.course.name }),
          pageLabel: t('selectPage'),
        }
      : undefined,
    columns,
    bar: canBook && proposed.length > 0 && (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {picked.length > 0 && (
          <Button
            onClick={() => {
              setSelected(new Set())
            }}
          >
            {t('clearSelection')}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={picked.length === 0}
          onClick={event => {
            ask(picked, asOf, event.currentTarget)
          }}
        >
          <CalendarCheck aria-hidden />
          {t('bookSelected', { count: picked.length })}
        </Button>
      </div>
    ),
    dialog,
  }
}

/**
 * What an admin can do about a row with nothing booked: book it (on the proposed session or an
 * alternative, chosen in the dialog), or, with no session to take, schedule a new one.
 */
function RowRemedy({ item, onBook }: { item: PlanItem; onBook: (from: HTMLElement) => void }) {
  const t = useTranslations('bookings')
  const { employee, course } = item.need
  if (isProposed(item))
    return (
      <BookButton
        label={t('bookFor', { course: course.name, name: employee.name })}
        onClick={onBook}
      />
    )
  if (item.proposal?.kind !== 'NONE') return null
  return (
    <Button asChild size="sm">
      <Link
        href={scheduleHref(item)}
        aria-label={t('scheduleFor', { course: course.name, name: employee.name })}
      >
        <CalendarPlus aria-hidden />
        {t('todo.schedule')}
      </Link>
    </Button>
  )
}
