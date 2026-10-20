'use client'

import { checkMoves, type OverbookedSession } from '@muni/domain/advisor'
import { parseCount } from '@muni/utils/money'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/** A typed count: empty is none moved; null while it is not a whole number. */
const countOf = (text: string): number | null => (text.trim() === '' ? 0 : parseCount(text))

/**
 * The seats an admin types to move off an overbooked session, one count per target (the
 * suggestion fills them in), and what they come to (`checkMoves`): the error each field
 * shows, whether nothing is typed wrong, and the bookings left on the session.
 */
export function useMoveCounts(o: OverbookedSession) {
  const t = useTranslations('advisor.overbooked.dialog')
  const te = useTranslations('forms.errors')
  const [counts, setCounts] = useState<ReadonlyMap<string, string>>(
    () => new Map(o.moves.map(m => [m.to.externalId, String(m.count)]))
  )
  const check = checkMoves(o, new Map([...counts].map(([id, text]) => [id, countOf(text)])))
  const { moves, total, overTarget, tooMany } = check
  return {
    ...check,
    /** What is typed for a target session. */
    text: (id: string) => counts.get(id) ?? '',
    type: (id: string, value: string) => {
      setCounts(current => new Map(current).set(id, value))
    },
    /** What is wrong with one count, on its field (the total goes under them all). */
    fieldError: (id: string) => {
      const move = moves.find(m => m.target.session.externalId === id)
      if (!move) return undefined
      if (move.count === null) return te('not_a_number')
      return move.count > move.target.free ? t('overField', { free: move.target.free }) : undefined
    },
    /** Nothing typed wrong: the dialog can say what the session comes to. */
    clean: moves.every(m => m.count !== null) && overTarget.length === 0 && !tooMany,
    /** Bookings left on the session once the typed seats move. */
    after: o.booked - total,
  }
}

export type MoveCounts = ReturnType<typeof useMoveCounts>
