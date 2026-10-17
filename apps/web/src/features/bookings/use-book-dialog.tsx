'use client'

import { type BookingQuery, type PlanItem, unpack } from '@muni/domain/advisor'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { type ReactNode, useCallback, useState } from 'react'

import { readQuery } from '@/lib/query/queries'

// Loaded when needed: the dialog opens when something is booked.
const BookDialog = dynamic(() => import('./book-dialog').then(m => m.BookDialog))

type Asking = { from: HTMLElement } & (
  { items: PlanItem[]; asOf: string } | { query: BookingQuery }
)

/**
 * Booking needed trainings: `ask` opens the dialog for trainings the caller holds (the
 * advisor's rows), `askFor` for the ones a query names (a person's, a course's in a
 * department), read as the dialog opens. Focus returns to `from` when it closes; `dialog` is
 * rendered once by the caller.
 */
export function useBookDialog(onBooked: () => void = () => undefined): {
  ask: (items: PlanItem[], asOf: string, from: HTMLElement) => void
  askFor: (query: BookingQuery, from: HTMLElement) => void
  dialog: ReactNode
} {
  const [asking, setAsking] = useState<Asking | null>(null)
  // Stable, so the columns that call them are built once.
  const ask = useCallback((items: PlanItem[], asOf: string, from: HTMLElement) => {
    setAsking({ items, asOf, from })
  }, [])
  const askFor = useCallback((query: BookingQuery, from: HTMLElement) => {
    setAsking({ query, from })
  }, [])
  if (asking === null) return { ask, askFor, dialog: null }
  const shared = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) setAsking(null)
    },
    returnFocusTo: () => asking.from,
    onBooked,
  }
  return {
    ask,
    askFor,
    dialog:
      'query' in asking ? (
        <BookDialogFor query={asking.query} {...shared} />
      ) : (
        <BookDialog items={asking.items} asOf={asking.asOf} source="ADVISOR" {...shared} />
      ),
  }
}

/** The dialog over the trainings a query names, read fresh as it opens. */
function BookDialogFor({
  query,
  ...shared
}: {
  query: BookingQuery
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo: () => HTMLElement
  onBooked: () => void
}) {
  const read = useQuery({
    ...readQuery('booking-choices', query),
    // What can be booked changes with every booking anywhere: never from the cache.
    staleTime: 0,
    gcTime: 0,
    select: ({ asOf, items }) => ({ asOf, items: unpack(items) }),
  })
  return (
    <BookDialog
      items={read.isPending ? 'loading' : read.isError ? null : read.data.items}
      asOf={read.data?.asOf ?? ''}
      source="MANUAL"
      {...shared}
    />
  )
}
