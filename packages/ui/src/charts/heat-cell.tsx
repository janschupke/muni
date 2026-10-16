import type { ReactNode } from 'react'

import { cn } from '../cn'

// Sequential steps 1–6 (light → dark in light mode; the dark theme swaps the steps so
// low values still recede toward the surface). Ink flips where the step gets dark.
const STEPS = [
  'bg-seq-1 text-seq-ink-light',
  'bg-seq-2 text-seq-ink-light',
  'bg-seq-3 text-seq-ink-light',
  'bg-seq-4 text-seq-ink-dark',
  'bg-seq-5 text-seq-ink-dark',
  'bg-seq-6 text-seq-ink-dark',
] as const

/** Intensity 0–1 → one of six equal-width buckets. */
function sequentialStep(intensity: number): number {
  return Math.min(STEPS.length - 1, Math.max(0, Math.floor(intensity * STEPS.length)))
}

/**
 * One heatmap cell. `intensity` (0–1) picks the step: 0 recedes toward the surface,
 * 1 is the strongest. The value is always printed inside; colour only reinforces it.
 */
export function HeatCell({
  intensity,
  title,
  children,
  className,
}: {
  intensity: number | null
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      title={title}
      className={cn(
        'flex h-10 min-w-16 items-center justify-center rounded-sm text-sm font-medium tabular-nums',
        intensity === null ? 'text-fg-subtle' : STEPS[sequentialStep(intensity)],
        className
      )}
    >
      {children}
    </div>
  )
}

export function HeatLegend({ low, high }: { low: ReactNode; high: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-fg-muted">
      <span>{low}</span>
      <span className="flex gap-0.5" aria-hidden>
        {STEPS.map(step => (
          <span key={step} className={cn('h-3 w-6 rounded-sm', step.split(' ')[0])} />
        ))}
      </span>
      <span>{high}</span>
    </div>
  )
}
