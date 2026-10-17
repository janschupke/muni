'use client'

import type { PlanItem, Proposal } from '@muni/domain/advisor'
import { Button } from '@muni/ui/button'
import { CalendarPlus } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useState } from 'react'

import type { Booking } from './book-dialog'

// Loaded when needed: the dialog opens when rows are booked.
const BookDialog = dynamic(() => import('./book-dialog').then(m => m.BookDialog))

type SessionProposal = Extract<Proposal, { kind: 'SESSION' }>
export type ProposedItem = PlanItem & { proposal: SessionProposal }

export const isProposed = (i: PlanItem): i is ProposedItem => i.proposal?.kind === 'SESSION'

/** A new session of the course, from the advisor: its form returns here after saving. */
export const scheduleHref = (item: PlanItem) => `/courses/${item.need.course.code}/sessions/new`

/**
 * Booking from an advisor table: `ask` opens the confirm for the bookings (focus returns to
 * `from` when it closes); `dialog` is rendered once by the table.
 */
export function useBookDialog(onBooked: () => void = () => undefined): {
  ask: (bookings: Booking[], from: HTMLElement) => void
  dialog: ReactNode
} {
  const [asking, setAsking] = useState<{ bookings: Booking[]; from: HTMLElement } | null>(null)
  // Stable, so the columns that call it are built once.
  const ask = useCallback((bookings: Booking[], from: HTMLElement) => {
    setAsking({ bookings, from })
  }, [])
  return {
    ask,
    dialog: asking && (
      <BookDialog
        open
        bookings={asking.bookings}
        onOpenChange={open => {
          if (!open) setAsking(null)
        }}
        returnFocusTo={() => asking.from}
        onBooked={onBooked}
      />
    ),
  }
}

/**
 * What an admin can do about a row with nothing booked: book the session the advisor proposes,
 * or, with none to propose, schedule a new session of the course.
 */
export function RowRemedy({
  item,
  onBook,
}: {
  item: PlanItem
  onBook: (item: ProposedItem, from: HTMLElement) => void
}) {
  const t = useTranslations('advisor.action')
  const name = item.need.employee.name
  if (isProposed(item))
    return (
      <Button
        size="sm"
        aria-label={t('bookOne', { name })}
        onClick={event => {
          onBook(item, event.currentTarget)
        }}
      >
        <CalendarPlus aria-hidden />
        {t('book')}
      </Button>
    )
  if (item.proposal?.kind !== 'NONE') return null
  return (
    <Button asChild size="sm">
      <Link
        href={scheduleHref(item)}
        aria-label={t('scheduleFor', { course: item.need.course.name, name })}
      >
        <CalendarPlus aria-hidden />
        {t('todo.schedule')}
      </Link>
    </Button>
  )
}
