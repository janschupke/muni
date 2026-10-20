import type { ReactNode } from 'react'

/**
 * Nothing to show. `box` (default) stands in for a whole table or section; `inline` is a
 * quiet line inside a card. `action` is what to do about it (a list's create button), under
 * the text of a box.
 */
export function EmptyState({
  title,
  children,
  action,
  variant = 'box',
}: {
  title: ReactNode
  children?: ReactNode | undefined
  action?: ReactNode | undefined
  variant?: 'box' | 'inline' | undefined
}) {
  if (variant === 'inline') return <p className="text-sm text-fg-muted">{title}</p>
  return (
    <div className="rounded-lg border border-dashed border-border-emphasis px-6 py-10 text-center">
      <p className="font-medium text-fg">{title}</p>
      {Boolean(children) && <div className="mt-1 text-sm text-fg-muted">{children}</div>}
      {Boolean(action) && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
