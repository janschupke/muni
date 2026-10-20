'use client'

import { Clock } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

import { cn } from '../../../cn'
import { controlClass } from '../control-class'
import { parseTime } from './calendar'
import { fieldButtonClass, popoverClass } from './picker-classes'

export interface TimePickerLabels {
  /** The clock button: "Choose time". */
  open: string
  hours: string
  minutes: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h))

/**
 * A 24-hour time field: type it (`9`, `930`, `9:30`, `9.30` all read as 09:30) or pick the
 * hour and then the minute from two lists (Radix Popover; arrows, Home/End, Enter).
 *
 * With `name` it posts `HH:mm` through a hidden input; text that is not a time is posted as
 * typed, so the server's validation says so. It accepts the props `Field` hands its control.
 */
export function TimePicker({
  value,
  defaultValue = '',
  onValueChange,
  name,
  minuteStep = 5,
  labels,
  disabled,
  required,
  id,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  /** `HH:mm`, or '' for none. */
  value?: string | undefined
  defaultValue?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  name?: string | undefined
  /** The minutes the list offers (any minute can be typed). */
  minuteStep?: number | undefined
  labels: TimePickerLabels
  disabled?: boolean | undefined
  required?: boolean | undefined
  id?: string | undefined
  className?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const current = value ?? uncontrolled
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // Picking the hour hands the focus to the minutes.
  const [toMinutes, setToMinutes] = useState(0)

  const commit = (next: string) => {
    setEditing(null)
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }
  const typed = editing === null ? null : editing.trim() === '' ? '' : parseTime(editing)
  const unreadable = editing !== null && typed === null
  const posted = editing === null ? current : (typed ?? editing)
  const shown = typed ?? current
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => pad(i * minuteStep))

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="––:––"
        value={editing ?? current}
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
          <Clock aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className={cn(popoverClass, 'flex gap-1 p-1')}
            onOpenAutoFocus={event => {
              event.preventDefault()
            }}
          >
            <Column
              label={labels.hours}
              options={HOURS}
              selected={shown.slice(0, 2)}
              focusOnOpen
              onPick={hour => {
                commit(`${hour}:${shown.slice(3, 5) || '00'}`)
                setToMinutes(n => n + 1)
              }}
            />
            <Column
              label={labels.minutes}
              options={minutes}
              selected={shown.slice(3, 5)}
              focusSignal={toMinutes}
              onPick={minute => {
                commit(`${shown.slice(0, 2) || '00'}:${minute}`)
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

/** One scrolling list of choices (hours or minutes), with a roving focus. */
function Column({
  label,
  options,
  selected,
  focusOnOpen = false,
  focusSignal = 0,
  onPick,
}: {
  label: string
  options: string[]
  selected: string
  focusOnOpen?: boolean
  /** Each change moves the focus here. */
  focusSignal?: number
  onPick: (option: string) => void
}) {
  const [active, setActive] = useState(() =>
    Math.max(0, options.includes(selected) ? options.indexOf(selected) : 0)
  )
  const items = useRef<(HTMLDivElement | null)[]>([])
  const moved = useRef(focusOnOpen)

  useEffect(() => {
    const item = items.current[active]
    item?.scrollIntoView({ block: 'nearest' })
    if (moved.current) item?.focus()
  }, [active])

  useEffect(() => {
    if (focusSignal > 0) items.current[active]?.focus()
    // Only a new signal moves the focus; moving within the list is the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1
    const next: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }
    if (event.key in next) {
      event.preventDefault()
      moved.current = true
      setActive(next[event.key] ?? active)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[active]
      if (option !== undefined) onPick(option)
    }
  }

  return (
    <div
      role="listbox"
      aria-label={label}
      className="flex max-h-60 w-14 flex-col gap-0.5 overflow-y-auto p-0.5"
    >
      {options.map((option, index) => (
        <div
          key={option}
          ref={node => {
            items.current[index] = node
          }}
          role="option"
          aria-selected={option === selected}
          tabIndex={index === active ? 0 : -1}
          onClick={() => {
            onPick(option)
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'cursor-default rounded-sm py-1 text-center tabular-nums outline-none hover:bg-state-hover focus-visible:ring-2 focus-visible:ring-focus-ring',
            option === selected && 'bg-accent text-accent-fg hover:bg-accent-hover'
          )}
        >
          {option}
        </div>
      ))}
    </div>
  )
}
