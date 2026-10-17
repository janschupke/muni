'use client'

import { RadioGroup } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../cn'
import { Tooltip } from './tooltip'

export interface SegmentedItem<T extends string> {
  value: T
  /** Accessible name; also the tooltip when `content` is an icon. */
  label: string
  /** What the segment shows; defaults to `label`. */
  content?: ReactNode | undefined
}

/**
 * A compact one-of-several switch (radio group): arrow keys move and select, as with
 * native radios.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  items,
  label,
  disabled,
  className,
}: {
  value: T
  onValueChange: (value: T) => void
  items: readonly SegmentedItem<T>[]
  /** Accessible name of the group. */
  label: string
  disabled?: boolean | undefined
  className?: string | undefined
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={next => {
        const item = items.find(i => i.value === next)
        if (item) onValueChange(item.value)
      }}
      aria-label={label}
      disabled={disabled}
      orientation="horizontal"
      className={cn('flex rounded-md border border-border-default p-0.5', className)}
    >
      {items.map(item => (
        <Tooltip key={item.value} content={item.label}>
          <RadioGroup.Item
            value={item.value}
            aria-label={item.content === undefined ? undefined : item.label}
            className="flex h-7 min-w-7 items-center justify-center rounded-sm px-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-state-hover hover:text-fg disabled:opacity-60 aria-checked:bg-state-selected aria-checked:text-fg aria-checked:hover:bg-state-active [&_svg]:size-4"
          >
            {item.content ?? item.label}
          </RadioGroup.Item>
        </Tooltip>
      ))}
    </RadioGroup.Root>
  )
}
