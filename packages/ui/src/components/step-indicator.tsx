import { Check } from 'lucide-react'

import { cn } from '../cn'

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li
            key={step}
            className="flex items-center gap-2"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-accent bg-accent text-accent-fg',
                active && 'border-accent text-accent-text',
                !done && !active && 'border-border-emphasis text-fg-subtle'
              )}
            >
              {done ? <Check aria-hidden className="size-3.5" /> : index + 1}
            </span>
            <span className={cn(active ? 'font-medium text-fg' : 'text-fg-muted')}>{step}</span>
            {index < steps.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-6 bg-border-emphasis" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
