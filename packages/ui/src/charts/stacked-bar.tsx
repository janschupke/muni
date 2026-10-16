import { cn } from '../cn'

export interface StackedSegment {
  key: string
  label: string
  value: number
  /** A `bg-*` utility for the segment fill. */
  fillClass: string
}

/**
 * A 100% stacked horizontal bar (part-to-whole for one row). Segments are separated by a
 * 2px surface gap; the hover title and the caller's visible numbers carry the values,
 * so colour never carries meaning alone.
 */
export function StackedBar({
  segments,
  label,
  className,
}: {
  segments: StackedSegment[]
  label: string
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const visible = segments.filter(s => s.value > 0)
  return (
    <div
      role="img"
      aria-label={`${label}: ${segments.map(s => `${s.label} ${s.value}`).join(', ')}`}
      className={cn('flex h-3 w-full gap-0.5 overflow-hidden rounded-sm bg-chart-track', className)}
    >
      {total > 0 &&
        visible.map(segment => (
          <span
            key={segment.key}
            title={`${segment.label}: ${segment.value}`}
            className={cn('h-full first:rounded-l-sm last:rounded-r-sm', segment.fillClass)}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
    </div>
  )
}
