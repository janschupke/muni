'use client'

import type { BookingBlock, BookingQuery, PersonBookingBlock } from '@muni/domain/advisor'
import { Button } from '@muni/ui/button'
import { UnavailableButton } from '@muni/ui/unavailable-button'
import { CalendarPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { useBookDialog } from './use-book-dialog'

/** The one way every table starts booking: "Book…", named for what it books. */
export function BookButton({
  label,
  onClick,
  children,
}: {
  /** Its accessible name: whom and what it books. */
  label: string
  onClick: (from: HTMLElement) => void
  /** The visible text; "Book…" by default. */
  children?: ReactNode
}) {
  const t = useTranslations('bookings')
  return (
    <Button
      size="sm"
      aria-label={label}
      onClick={event => {
        onClick(event.currentTarget)
      }}
    >
      <CalendarPlus aria-hidden />
      {children ?? t('book')}
    </Button>
  )
}

/** Why a training (`blocked`) or a person's trainings (`blockedAll`) cannot be booked. */
export type Blocked =
  { of: 'training'; reason: BookingBlock } | { of: 'person'; reason: PersonBookingBlock }

/**
 * Books the trainings a query names (a person's, one of theirs, a department's need of a
 * course): the dialog reads them as it opens, with the session proposed for each. With
 * `blocked`, it stands dimmed where it would be and says why nothing can be booked.
 */
export function BookNeedButton({
  query,
  label,
  blocked,
  children,
}: {
  query: BookingQuery
  label: string
  blocked?: Blocked | null | undefined
  children?: ReactNode
}) {
  const t = useTranslations('bookings')
  if (blocked)
    return (
      <UnavailableButton
        size="sm"
        aria-label={label}
        reason={
          blocked.of === 'training'
            ? t(`blocked.${blocked.reason}`)
            : t(`blockedAll.${blocked.reason}`)
        }
      >
        <CalendarPlus aria-hidden />
        {children ?? t('book')}
      </UnavailableButton>
    )
  return (
    <BookNeedTrigger query={query} label={label}>
      {children}
    </BookNeedTrigger>
  )
}

function BookNeedTrigger({
  query,
  label,
  children,
}: {
  query: BookingQuery
  label: string
  children?: ReactNode
}) {
  const { askFor, dialog } = useBookDialog()
  return (
    <>
      <BookButton
        label={label}
        onClick={from => {
          askFor(query, from)
        }}
      >
        {children}
      </BookButton>
      {dialog}
    </>
  )
}
