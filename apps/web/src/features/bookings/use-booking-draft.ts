'use client'

import {
  choicesOf,
  isProposed,
  type PlanItem,
  type ProposedItem,
  type SessionChoice,
  summarizeBookings,
} from '@muni/domain/advisor'
import { useState } from 'react'

/** A training's key: one person, one course. */
export const itemId = (i: PlanItem) => `${i.need.employee.externalId}|${i.need.course.code}`

/**
 * The bookings the Book… dialog is deciding: each training on the session chosen for it (the
 * advisor's proposal unless another is picked), the ones left out (a choice only among
 * several), and what they come to: the cost, and any session they would overfill.
 */
export function useBookingDraft(items: readonly PlanItem[]) {
  // The session each training books (its id), when not the proposal; the ones left out.
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(new Map())
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())

  /** The session a training books: the one chosen for it, else the advisor's proposal. */
  const choiceOf = (item: ProposedItem): SessionChoice =>
    choicesOf(item).find(c => c.session.externalId === chosen.get(itemId(item))) ?? {
      session: item.proposal.session,
      window: item.proposal.window,
    }

  const proposed = items.filter(isProposed)
  const bookings = proposed
    .filter(item => !left.has(itemId(item)))
    .map(item => ({ item, session: choiceOf(item).session }))
  const { cost, over } = summarizeBookings(bookings.map(b => b.session))

  return {
    bookings,
    cost,
    over,
    /** Leaving one out is a choice only among several. */
    pickable: proposed.length > 1,
    choiceOf,
    included: (item: PlanItem) => !left.has(itemId(item)),
    include: (item: PlanItem, on: boolean) => {
      setLeft(current => {
        const next = new Set(current)
        if (on) next.delete(itemId(item))
        else next.add(itemId(item))
        return next
      })
    },
    choose: (item: PlanItem, sessionId: string) => {
      setChosen(current => new Map(current).set(itemId(item), sessionId))
    },
  }
}

export type BookingDraft = ReturnType<typeof useBookingDraft>
