import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../cn'
import { Tooltip } from '../components/tooltip'

/** Rate bands, best first (the same names as complianceBand in @muni/domain). */
export const HEAT_BANDS = ['FULL', 'HIGH', 'FAIR', 'LOW', 'POOR'] as const
export type HeatBand = (typeof HEAT_BANDS)[number]

// Green → yellow → red in plain sentiment colours. Neighbouring bands stay apart for
// colour-blind readers; the printed value carries the order where hue alone would not, and
// each band brings its own ink so that value keeps 4.5:1.
const BAND_CLASS: Record<HeatBand, string> = {
  FULL: 'bg-heat-full text-heat-full-ink',
  HIGH: 'bg-heat-high text-heat-high-ink',
  FAIR: 'bg-heat-fair text-heat-fair-ink',
  LOW: 'bg-heat-low text-heat-low-ink',
  POOR: 'bg-heat-poor text-heat-poor-ink',
}

const SWATCH_CLASS: Record<HeatBand, string> = {
  FULL: 'bg-heat-full',
  HIGH: 'bg-heat-high',
  FAIR: 'bg-heat-fair',
  LOW: 'bg-heat-low',
  POOR: 'bg-heat-poor',
}

const cellClass =
  'flex h-10 w-full min-w-16 items-center justify-center rounded-sm text-sm font-medium tabular-nums'

/**
 * One heatmap cell, coloured by its band (`null` = not applicable). The value is always
 * printed inside; colour only reinforces it. With `onClick` it is a button.
 */
export function HeatCell({
  band,
  tooltip,
  children,
  className,
  ...props
}: {
  band: HeatBand | null
  /** What the cell stands for, shown on hover (and on focus for a button). */
  tooltip: string
  children: ReactNode
  className?: string
} & Omit<ComponentProps<'button'>, 'title' | 'children' | 'className'>) {
  const classes = cn(cellClass, band === null ? 'text-fg-subtle' : BAND_CLASS[band], className)
  return (
    <Tooltip content={tooltip}>
      {props.onClick === undefined ? (
        <div className={classes}>{children}</div>
      ) : (
        <button
          type="button"
          className={cn(
            classes,
            'cursor-pointer transition-shadow hover:shadow-[inset_0_0_0_2px_var(--p-fg)]'
          )}
          {...props}
        >
          {children}
        </button>
      )}
    </Tooltip>
  )
}

/** The bands in order, each with its label (e.g. the range it covers). */
export function HeatLegend({
  items,
  label,
}: {
  items: readonly { band: HeatBand; label: ReactNode }[]
  label: string
}) {
  return (
    <ul
      aria-label={label}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted"
    >
      {items.map(item => (
        <li key={item.band} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('h-3 w-5 rounded-sm', SWATCH_CLASS[item.band])} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
