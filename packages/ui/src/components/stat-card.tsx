import type { ReactNode } from 'react'

import { cn } from '../cn'

const toneBar = {
  neutral: 'before:bg-border-emphasis',
  accent: 'before:bg-accent',
  success: 'before:bg-success-fill',
  warning: 'before:bg-warning-fill',
  danger: 'before:bg-danger-fill',
} as const

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: keyof typeof toneBar
  /** When given, the card is a toggle button (used as a filter). */
  onClick?: () => void
  pressed?: boolean
  className?: string
}

/** A headline number. Rendered as a toggle button when it doubles as a filter. */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  onClick,
  pressed,
  className,
}: StatCardProps) {
  const body = (
    <>
      <span className="block text-sm text-fg-muted">{label}</span>
      <span className="mt-1 block text-2xl font-semibold text-fg">{value}</span>
      {hint && <span className="mt-0.5 block text-xs text-fg-subtle">{hint}</span>}
    </>
  )
  const base = cn(
    'relative overflow-hidden rounded-lg border border-border-default bg-surface-elevated px-4 py-3 text-left shadow-card',
    'before:absolute before:inset-y-0 before:left-0 before:w-1',
    toneBar[tone],
    className
  )
  if (!onClick) return <div className={base}>{body}</div>
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        base,
        'transition-colors hover:bg-state-hover',
        pressed && 'border-accent bg-state-selected ring-1 ring-accent'
      )}
    >
      {body}
    </button>
  )
}
