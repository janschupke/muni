import { cn } from '../cn'
import { barFillClass, barTrackClass } from '../components/display/meter'
import { Tooltip } from '../components/feedback/tooltip'

export interface StackedSegment {
  key: string
  label: string
  value: number
  /** A `bg-*` utility for the segment fill. */
  fillClass: string
}

/**
 * A 100% stacked horizontal bar (part-to-whole for one row). Segments are separated by a
 * 2px surface gap; the hover tooltip and the caller's visible numbers carry the values,
 * so colour never carries meaning alone.
 */
export function StackedBar({
  segments,
  label,
  scale = 1,
  className,
}: {
  segments: StackedSegment[]
  label: string
  /** How long the bar is against the longest of its set (0–1): bars in a list compare. */
  scale?: number | undefined
  className?: string | undefined
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const visible = segments.filter(s => s.value > 0)
  return (
    <div
      role="img"
      aria-label={`${label}: ${segments.map(s => `${s.label} ${s.value}`).join(', ')}`}
      className={cn(barTrackClass, 'flex h-3 gap-0.5', className)}
      style={scale < 1 ? { width: `${Math.max(0, scale) * 100}%` } : undefined}
    >
      {total > 0 &&
        visible.map(segment => (
          <Tooltip key={segment.key} content={`${segment.label}: ${String(segment.value)}`}>
            <span
              className={cn(
                barFillClass,
                'first:rounded-l-full last:rounded-r-full',
                segment.fillClass
              )}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          </Tooltip>
        ))}
    </div>
  )
}
