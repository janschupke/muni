import { cn } from '../cn'

/**
 * A horizontal fill showing value / max. Over capacity turns the fill critical.
 * The numbers are always rendered next to it by the caller; the bar never carries meaning alone.
 */
export function Meter({
  value,
  max,
  label,
  className,
}: {
  value: number
  max: number
  label: string
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
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-chart-track', className)}
    >
      <div
        className={cn('h-full rounded-full', over ? 'bg-danger-fill' : 'bg-accent')}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
    </div>
  )
}
