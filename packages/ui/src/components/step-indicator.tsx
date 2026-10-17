import { Check } from 'lucide-react'

import { cn } from '../cn'

/**
 * A wizard's steps across the full width: each step's number and name, joined by a line that
 * grows to fill the row, done steps and their lines in the accent.
 */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex w-full items-center gap-2 text-sm">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        const last = index === steps.length - 1
        return (
          <li
            key={step}
            className={cn('flex min-w-0 items-center gap-2', !last && 'flex-1')}
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-accent bg-accent text-accent-fg',
                active && 'border-accent text-accent-text',
                !done && !active && 'border-border-emphasis text-fg-subtle'
              )}
            >
              {done ? <Check aria-hidden className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn('whitespace-nowrap', active ? 'font-medium text-fg' : 'text-fg-muted')}
            >
              {step}
            </span>
            {!last && (
              <span
                aria-hidden
                className={cn('h-px min-w-4 flex-1', done ? 'bg-accent' : 'bg-border-emphasis')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
