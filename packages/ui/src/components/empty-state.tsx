import type { ReactNode } from 'react'

/**
 * Nothing to show. `box` (default) stands in for a whole table or section; `inline` is a
 * quiet line inside a card.
 */
export function EmptyState({
  title,
  children,
  variant = 'box',
}: {
  title: ReactNode
  children?: ReactNode
  variant?: 'box' | 'inline'
}) {
  if (variant === 'inline') return <p className="text-sm text-fg-muted">{title}</p>
  return (
    <div className="rounded-lg border border-dashed border-border-emphasis px-6 py-10 text-center">
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 text-sm text-fg-muted">{children}</div>}
    </div>
  )
}
