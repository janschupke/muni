import type { ReactNode } from 'react'

import { cn } from '../../cn'

/**
 * A bar with its figure. `stacked`: label and value on a line above the bar (lists of rows);
 * `inline`: the bar, then the value and an optional note, on one line (table cells).
 */
export function BarRow({
  bar,
  value,
  label,
  after,
  layout = 'stacked',
  barClassName,
  className,
}: {
  bar: ReactNode
  value: ReactNode
  label?: ReactNode | undefined
  /** Inline only: something after the value (an "Overbooked" badge). */
  after?: ReactNode | undefined
  layout?: 'stacked' | 'inline' | undefined
  barClassName?: string | undefined
  className?: string | undefined
}) {
  if (layout === 'inline') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className={cn('min-w-0 flex-1', barClassName)}>{bar}</div>
        <span className="text-xs whitespace-nowrap tabular-nums">{value}</span>
        {after}
      </div>
    )
  }
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0">{label}</span>
        <span className="font-medium text-fg tabular-nums">{value}</span>
      </div>
      <div className={barClassName}>{bar}</div>
    </div>
  )
}
