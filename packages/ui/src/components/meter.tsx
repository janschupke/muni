import { cn } from '../cn'

/** Track and fill shared by every bar (Meter, StackedBar), so they look and move alike. */
export const barTrackClass = 'w-full overflow-hidden rounded-full bg-chart-track'
export const barFillClass = 'h-full transition-[width] duration-(--motion-slow)'

const SIZE = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' } as const

const TONE = {
  accent: 'bg-accent',
  success: 'bg-success-fill',
  warning: 'bg-warning-fill',
  serious: 'bg-serious-fill',
  danger: 'bg-danger-fill',
} as const
export type MeterTone = keyof typeof TONE

/**
 * A horizontal fill showing value / max, in the caller's signal tone (brand blue when it
 * signals nothing). Over capacity always turns the fill critical.
 * The numbers are always rendered next to it by the caller; the bar never carries meaning alone.
 */
export function Meter({
  value,
  max,
  label,
  size = 'sm',
  tone = 'accent',
  className,
}: {
  value: number
  max: number
  label: string
  size?: keyof typeof SIZE | undefined
  tone?: MeterTone | undefined
  className?: string | undefined
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
        className={cn(barFillClass, 'rounded-full', TONE[over ? 'danger' : tone])}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
    </div>
  )
}
