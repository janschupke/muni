'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'

import { cn } from '../../../cn'
import { addDays, addMonths, clamp, endOfWeek, monthGrid, sameMonth, startOfWeek } from './calendar'
import type { DatePickerLabels } from './date-picker'

const NAV_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-state-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4'

/**
 * The month grid a date picker opens: a month at a time, moved with the buttons or from the
 * keyboard (arrows a day or a week, Page Up/Down a month, with Shift a year, Home/End the
 * week's ends, Enter picks).
 */
export function Calendar({
  selected,
  today,
  min,
  max,
  isDateDisabled,
  locale,
  labels,
  required,
  onSelect,
}: {
  selected: string
  today: string
  min?: string | undefined
  max?: string | undefined
  isDateDisabled?: ((iso: string) => boolean) | undefined
  locale: string
  labels: DatePickerLabels
  required: boolean
  onSelect: (iso: string) => void
}) {
  const captionId = useId()
  const [focused, setFocused] = useState(() => clamp(selected || today, min, max))
  const days = useRef(new Map<string, HTMLButtonElement>())
  // The focused day takes the keyboard focus when the calendar opens and when the keys move
  // it; the month buttons keep theirs, so they can be pressed again.
  const followFocus = useRef(true)

  useEffect(() => {
    if (followFocus.current) days.current.get(focused)?.focus()
  }, [focused])

  const unavailable = (iso: string) =>
    (min !== undefined && iso < min) ||
    (max !== undefined && iso > max) ||
    (isDateDisabled?.(iso) ?? false)
  const move = (next: string) => {
    setFocused(clamp(next, min, max))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => startOfWeek(focused),
      End: () => endOfWeek(focused),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
    }
    const next = step[event.key]
    if (!next) return
    event.preventDefault()
    followFocus.current = true
    move(next())
  }

  const caption = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${focused}T00:00:00Z`))
  const dayName = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const weekdays = monthGrid(focused)[0] ?? []
  const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
  const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex">
          <button
            type="button"
            className={NAV_BUTTON}
            aria-label={labels.previousYear}
            onClick={() => {
              followFocus.current = false
              move(addMonths(focused, -12))
            }}
          >
            <ChevronsLeft aria-hidden />
          </button>
          <button
            type="button"
            className={NAV_BUTTON}
            aria-label={labels.previousMonth}
            onClick={() => {
              followFocus.current = false
              move(addMonths(focused, -1))
            }}
          >
            <ChevronLeft aria-hidden />
          </button>
        </div>
        <p id={captionId} aria-live="polite" className="font-medium capitalize">
          {caption}
        </p>
        <div className="flex">
          <button
            type="button"
            className={NAV_BUTTON}
            aria-label={labels.nextMonth}
            onClick={() => {
              followFocus.current = false
              move(addMonths(focused, 1))
            }}
          >
            <ChevronRight aria-hidden />
          </button>
          <button
            type="button"
            className={NAV_BUTTON}
            aria-label={labels.nextYear}
            onClick={() => {
              followFocus.current = false
              move(addMonths(focused, 12))
            }}
          >
            <ChevronsRight aria-hidden />
          </button>
        </div>
      </div>
      <table role="grid" aria-labelledby={captionId} className="border-collapse">
        <thead>
          <tr>
            {weekdays.map(iso => (
              <th
                key={iso}
                scope="col"
                abbr={long.format(dateOf(iso))}
                className="size-9 text-xs font-normal text-fg-muted"
              >
                {short.format(dateOf(iso))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(focused).map(week => (
            <tr key={week[0]}>
              {week.map(iso => {
                const isSelected = iso === selected
                const off = unavailable(iso)
                return (
                  <td key={iso} role="gridcell" aria-selected={isSelected} className="p-0">
                    <button
                      type="button"
                      ref={node => {
                        if (node) days.current.set(iso, node)
                        else days.current.delete(iso)
                      }}
                      tabIndex={iso === focused ? 0 : -1}
                      aria-label={dayName.format(dateOf(iso))}
                      aria-current={iso === today ? 'date' : undefined}
                      disabled={off}
                      onClick={() => {
                        onSelect(iso)
                      }}
                      onKeyDown={onKeyDown}
                      className={cn(
                        'inline-flex size-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors hover:bg-state-hover disabled:pointer-events-none disabled:opacity-40',
                        !sameMonth(iso, focused) && 'text-fg-subtle',
                        iso === today &&
                          'font-semibold text-accent-text underline underline-offset-4',
                        isSelected && 'bg-accent text-accent-fg hover:bg-accent-hover'
                      )}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between gap-2 border-t border-border-muted pt-2">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm font-medium text-accent-text hover:bg-state-hover disabled:opacity-40"
          disabled={unavailable(today)}
          onClick={() => {
            onSelect(today)
          }}
        >
          {labels.today}
        </button>
        {!required && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-state-hover hover:text-fg"
            onClick={() => {
              onSelect('')
            }}
          >
            {labels.clear}
          </button>
        )}
      </div>
    </div>
  )
}
