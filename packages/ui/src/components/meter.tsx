import { cn } from '../cn'

/** Track and fill shared by every bar (Meter, StackedBar), so they look and move alike. */
export const barTrackClass = 'w-full overflow-hidden rounded-full bg-chart-track'
export const barFillClass = 'h-full transition-[width] duration-(--motion-slow)'

const SIZE = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' } as const

/**
 * A horizontal fill showing value / max. Over capacity turns the fill critical.
 * The numbers are always rendered next to it by the caller; the bar never carries meaning alone.
 */
export function Meter({
  value,
  max,
  label,
  size = 'sm',
  className,
}: {
  value: number
  max: number
  label: string
  size?: keyof typeof SIZE
  className?: string
}) {
  const ratio = max > 0 ? value / max : value > 0 ? Infinity : 0
  const over = ratio > 1
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(barTrackClass, SIZE[size], className)}
    >
      <div
        className={cn(barFillClass, 'rounded-full', over ? 'bg-danger-fill' : 'bg-accent')}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
    </div>
  )
}
