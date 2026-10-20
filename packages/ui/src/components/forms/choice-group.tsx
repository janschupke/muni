'use client'

import { RadioGroup } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../../cn'

export interface Choice<T extends string> {
  value: T
  title: ReactNode
  /** A line under the title saying what the choice does. */
  description?: ReactNode | undefined
  disabled?: boolean | undefined
}

/**
 * One of a few ways to go, each a card with a title and what it means (a radio group): the
 * choice in a dialog that asks how to resolve something. Arrow keys move and select.
 */
export function ChoiceGroup<T extends string>({
  value,
  onValueChange,
  choices,
  label,
  className,
}: {
  value: T
  onValueChange: (value: T) => void
  choices: readonly Choice<T>[]
  /** Accessible name of the group. */
  label: string
  className?: string | undefined
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={next => {
        const choice = choices.find(c => c.value === next)
        if (choice) onValueChange(choice.value)
      }}
      aria-label={label}
      className={cn('grid gap-2 sm:grid-cols-2', className)}
    >
      {choices.map(choice => (
        <RadioGroup.Item
          key={choice.value}
          value={choice.value}
          disabled={choice.disabled}
          className="flex items-start gap-3 rounded-md border border-border-control bg-control p-3 text-left transition-colors hover:layer-hover disabled:cursor-not-allowed disabled:border-border-default disabled:bg-transparent disabled:text-fg-muted data-[state=checked]:border-accent data-[state=checked]:bg-state-selected"
        >
          <span
            aria-hidden
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border-control in-data-[state=checked]:border-accent"
          >
            <RadioGroup.Indicator className="size-2 rounded-full bg-accent" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{choice.title}</span>
            {choice.description !== undefined && (
              <span className="text-xs text-fg-muted">{choice.description}</span>
            )}
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
