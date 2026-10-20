'use client'

import { CalendarDays } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'

import { cn } from '../../../cn'
import { controlClass } from '../control-class'
import { formatPattern, formatTyped, isoOf, parseTyped } from './calendar'
import { Calendar } from './calendar-grid'
import { fieldButtonClass, popoverClass } from './picker-classes'

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
  /** Letters for the format hint in the empty field: `{ day: 'dd', month: 'mm', year: 'yyyy' }`. */
  format: Record<'day' | 'month' | 'year', string>
}

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
  placeholder = formatPattern(labels.format),
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
  /** Shown while empty; by default an example date in the locale's order (`31. 3. 2026`). */
  placeholder?: string | undefined
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
  const typed = editing === null ? null : editing.trim() === '' ? '' : parseTyped(editing)
  const unreadable = editing !== null && typed === null
  const posted = editing === null ? current : (typed ?? editing)

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={editing ?? (current ? formatTyped(current) : '')}
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
