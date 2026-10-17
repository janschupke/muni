import type { ComponentType, ReactNode } from 'react'

import { cn } from '../cn'
import { surfaceClass } from './card'

const toneBar = {
  neutral: 'before:bg-border-emphasis',
  accent: 'before:bg-accent',
  success: 'before:bg-success-fill',
  warning: 'before:bg-warning-fill',
  serious: 'before:bg-serious-fill',
  danger: 'before:bg-danger-fill',
} as const

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode | undefined
  tone?: keyof typeof toneBar | undefined
  /** A toggle button (used as a filter). */
  onClick?: (() => void) | undefined
  pressed?: boolean | undefined
  /** Makes the card a link to what it counts (the filtered list behind the number). */
  href?: string | undefined
  /** The link component for `href`, e.g. Next's `Link`; ui never imports Next. */
  linkAs?: ComponentType<{ href: string; className?: string; children: ReactNode }> | undefined
  className?: string | undefined
}

const interactive =
  'transition-[background-color,border-color,box-shadow,translate] hover:-translate-y-px hover:shadow-overlay hover:layer-hover'

/** A headline number: static, a filter toggle, or a link to what it counts. */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  onClick,
  pressed,
  href,
  linkAs: LinkAs,
  className,
}: StatCardProps) {
  const body = (
    <>
      <span className="block text-sm text-fg-muted">{label}</span>
      <span className="mt-1 block text-2xl font-semibold text-fg tabular-nums">{value}</span>
      {hint && <span className="mt-0.5 block text-xs text-fg-subtle">{hint}</span>}
    </>
  )
  const base = cn(
    surfaceClass,
    'relative block overflow-hidden px-4 py-3 text-left',
    'before:absolute before:inset-y-0 before:left-0 before:w-1',
    toneBar[tone],
    className
  )
  if (href !== undefined) {
    const Anchor = LinkAs ?? 'a'
    return (
      <Anchor href={href} className={cn(base, interactive)}>
        {body}
      </Anchor>
    )
  }
  if (!onClick) return <div className={base}>{body}</div>
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        base,
        interactive,
        pressed && 'border-accent bg-state-selected ring-1 ring-accent'
      )}
    >
      {body}
    </button>
  )
}
