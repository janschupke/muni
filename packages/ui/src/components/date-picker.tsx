'use client'

import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'

import { cn } from '../cn'
import {
  addDays,
  addMonths,
  clamp,
  endOfWeek,
  formatTyped,
  isoOf,
  monthGrid,
  parseTyped,
  sameMonth,
  startOfWeek,
} from './calendar'
import { controlClass } from './field'

/** Everything the picker says; the app passes its translations (this package has none). */
export interface DatePickerLabels {
  /** The calendar button: "Choose date". */
  open: string
  previousMonth: string
  nextMonth: string
  previousYear: string
  nextYear: string
  today: string
  clear: string
}

export const popoverClass =
  'raised z-50 origin-(--radix-popover-content-transform-origin) rounded-md border border-border-default bg-surface-overlay text-sm text-fg shadow-overlay outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in'

/** An icon button inside the field, on its right. */
export const fieldButtonClass =
  'absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-fg-muted hover:bg-state-hover hover:text-fg disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4'

/**
 * A date field: type the date (`1. 3. 2026`, `3/1/2026` or ISO, by locale) or pick it from
 * a calendar (Radix Popover) that is driven fully from the keyboard: arrows move a day or a
 * week, Page Up/Down a month, with Shift a year, Home/End to the week's ends, Enter picks.
 *
 * With `name` it posts the ISO date (`YYYY-MM-DD`) through a hidden input; text that is not a
 * date is posted as typed, so the server's validation says so. It accepts the props `Field`
 * hands its control (`id`, `aria-describedby`, `aria-invalid`, `required`).
 */
export function DatePicker({
  value,
  defaultValue = '',
  onValueChange,
  name,
  min,
  max,
  isDateDisabled,
  today = isoOf(new Date()),
  locale,
  labels,
  disabled,
  required,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  /** ISO date, or '' for none. */
  value?: string | undefined
  defaultValue?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  name?: string | undefined
  min?: string | undefined
  max?: string | undefined
  isDateDisabled?: ((iso: string) => boolean) | undefined
  /** Marks today in the calendar (the app's time zone decides which day it is). */
  today?: string | undefined
  locale: string
  labels: DatePickerLabels
  disabled?: boolean | undefined
  required?: boolean | undefined
  id?: string | undefined
  className?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const current = value ?? uncontrolled
  // The text being typed; null shows the value itself.
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const commit = (next: string) => {
    setEditing(null)
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }
  const typed = editing === null ? null : editing.trim() === '' ? '' : parseTyped(editing, locale)
  const unreadable = editing !== null && typed === null
  const posted = editing === null ? current : (typed ?? editing)

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={editing ?? (current ? formatTyped(current, locale) : '')}
        onChange={event => {
          setEditing(event.target.value)
        }}
        onBlur={() => {
          if (editing !== null && typed !== null) commit(typed)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && editing !== null && typed !== null) {
            event.preventDefault()
            commit(typed)
          }
        }}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={invalid ?? (unreadable || undefined)}
        className={cn(controlClass, 'h-9 pr-10 tabular-nums')}
      />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          aria-label={labels.open}
          disabled={disabled}
          className={fieldButtonClass}
        >
          <CalendarDays aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className={cn(popoverClass, 'p-3')}
            onOpenAutoFocus={event => {
              // The calendar focuses its day itself.
              event.preventDefault()
            }}
          >
            <Calendar
              selected={typed ?? current}
              today={today}
              min={min}
              max={max}
              isDateDisabled={isDateDisabled}
              locale={locale}
              labels={labels}
              required={required ?? false}
              onSelect={next => {
                commit(next)
                setOpen(false)
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {name !== undefined && <input type="hidden" name={name} value={posted} />}
    </div>
  )
}

const NAV_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-state-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4'

function Calendar({
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
